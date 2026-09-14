FROM php:8.3-cli

RUN apt-get update \
    && apt-get install -y --no-install-recommends libsqlite3-dev \
    && docker-php-ext-install pdo_sqlite \
    && rm -rf /var/lib/apt/lists/*

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
CMD ["php", "-S", "0.0.0.0:80", "router.php"]
