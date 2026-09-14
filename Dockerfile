FROM php:8.3-apache

RUN apt-get update \
    && apt-get install -y --no-install-recommends libsqlite3-dev \
    && docker-php-ext-install pdo_sqlite \
    && rm -rf /var/lib/apt/lists/*

RUN a2enmod rewrite \
    && sed -ri 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf

RUN printf '%s\n' \
    '<Directory /var/www/html>' \
    '    Options -Indexes' \
    '    AllowOverride All' \
    '    Require all granted' \
    '</Directory>' \
    '<FilesMatch "(^setup\\.php$|\\.(sqlite|db)$)">' \
    '    Require all denied' \
    '</FilesMatch>' \
    > /etc/apache2/conf-available/camilla-security.conf \
    && a2enconf camilla-security

RUN printf '%s\n' \
    'date.timezone=Asia/Jakarta' \
    'upload_max_filesize=6M' \
    'post_max_size=8M' \
    'memory_limit=256M' \
    > /usr/local/etc/php/conf.d/camilla.ini

WORKDIR /var/www/html
COPY . /var/www/html

RUN mkdir -p /opt/camilla-seed/data /opt/camilla-seed/uploads \
    && cp -a /var/www/html/data/. /opt/camilla-seed/data/ 2>/dev/null || true \
    && cp -a /var/www/html/uploads/. /opt/camilla-seed/uploads/ 2>/dev/null || true

COPY docker-entrypoint.sh /usr/local/bin/camilla-entrypoint
RUN chmod +x /usr/local/bin/camilla-entrypoint

EXPOSE 80
ENTRYPOINT ["camilla-entrypoint"]
CMD ["apache2-foreground"]
