(() => {
  'use strict';

  const $pos = (s, root=document) => root.querySelector(s);
  const esc = (v='') => String(v).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const rupiah = v => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v||0));
  let scannerBusy = false;
  let lastPrintedInvoice = '';

  function addStyles(){
    if(document.getElementById('posEnhancementStyles')) return;
    const style = document.createElement('style');
    style.id = 'posEnhancementStyles';
    style.textContent = `
      .pos-import-actions{display:flex;gap:8px;flex-wrap:wrap}
      .pos-import-note{font-size:11px;color:var(--muted);margin-top:7px}
      .pos-scanner-panel{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px;padding:14px 16px;border:1px solid #bbf7d0;background:#f0fdf4;border-radius:14px}
      .pos-scanner-icon{font-size:24px}.pos-scanner-main{flex:1;min-width:220px}
      .pos-scanner-main strong{display:block;margin-bottom:3px}.pos-scanner-main small{color:var(--muted)}
      .pos-scanner-input{min-width:260px;flex:1;padding:12px 14px;border:1px solid #86efac;border-radius:10px;background:#fff;font-size:15px;outline:none}
      .pos-scanner-input:focus{border-color:#16a34a;box-shadow:0 0 0 3px rgba(22,163,74,.12)}
      .pos-print-btn{margin-top:12px}.history-print-btn{margin-top:8px;padding:7px 10px;font-size:11px}
      @media(max-width:700px){.pos-scanner-input{min-width:100%;width:100%}.pos-scanner-panel{align-items:flex-start}}
    `;
    document.head.appendChild(style);
  }

  function isAdminUi(){
    return document.body.classList.contains('role-admin');
  }

  function syncImportButtons(){
    const wrap = document.getElementById('posImportActions');
    if(wrap) wrap.classList.toggle('hidden', !isAdminUi());
  }

  function injectProductImport(){
    if(document.getElementById('posImportActions')) return;
    const addBtn = document.getElementById('addProductBtn');
    const toolbar = addBtn?.parentElement;
    if(!toolbar) return;

    const wrap = document.createElement('div');
    wrap.id = 'posImportActions';
    wrap.className = 'pos-import-actions';
    wrap.innerHTML = `
      <button type="button" class="btn btn-secondary" id="downloadProductTemplateBtn">⬇ Template Produk</button>
      <button type="button" class="btn" id="uploadProductTemplateBtn">⬆ Upload Template</button>
      <input type="file" id="productTemplateFile" accept=".csv,text/csv" hidden>
    `;
    toolbar.insertBefore(wrap, addBtn);

    const note = document.createElement('div');
    note.className = 'pos-import-note';
    note.textContent = 'Template CSV dapat dibuka/edit menggunakan Microsoft Excel. Barcode/SKU yang sudah ada akan diperbarui.';
    const sectionToolbar = document.querySelector('#products .section-toolbar');
    sectionToolbar?.appendChild(note);

    document.getElementById('downloadProductTemplateBtn')?.addEventListener('click', downloadTemplate);
    document.getElementById('uploadProductTemplateBtn')?.addEventListener('click', () => document.getElementById('productTemplateFile')?.click());
    document.getElementById('productTemplateFile')?.addEventListener('change', importTemplate);
    syncImportButtons();
  }

  function downloadTemplate(){
    const header = 'barcode,sku,name,category,purchase_price,sell_price,stock,min_stock\r\n';
    const blob = new Blob(['\ufeff' + header], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_produk_camilla_market.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function importTemplate(event){
    const input = event.target;
    const file = input.files?.[0];
    if(!file) return;

    if(!file.name.toLowerCase().endsWith('.csv')){
      alert('Gunakan template CSV yang didownload dari aplikasi. File dapat diedit di Excel lalu Save As CSV.');
      input.value = '';
      return;
    }

    if(!confirm(`Upload dan proses ${file.name}? Produk dengan barcode/SKU yang sama akan diperbarui.`)){
      input.value = '';
      return;
    }

    const fd = new FormData();
    fd.append('file', file);

    try{
      const response = await fetch('product-import.php', {method:'POST', body:fd, credentials:'same-origin', cache:'no-store'});
      const data = await response.json().catch(() => ({ok:false,message:'Response import tidak valid'}));
      if(!response.ok || !data.ok) throw new Error(data.message || 'Import gagal');

      let message = data.message || 'Import selesai.';
      if(Array.isArray(data.errors) && data.errors.length){
        message += '\n\nCatatan:\n' + data.errors.join('\n');
      }
      alert(message);
      if(typeof loadProducts === 'function') await loadProducts();
      if(typeof loadDashboard === 'function') await loadDashboard();
    }catch(error){
      alert(error.message || 'Import produk gagal.');
    }finally{
      input.value = '';
    }
  }

  function injectScanner(){
    if(document.getElementById('barcodeScanInput')) return;
    const cartSection = document.getElementById('cart');
    const layout = cartSection?.querySelector('.cart-layout');
    if(!cartSection || !layout) return;

    const panel = document.createElement('div');
    panel.className = 'pos-scanner-panel';
    panel.innerHTML = `
      <div class="pos-scanner-icon">▥</div>
      <div class="pos-scanner-main">
        <strong>Scanner Barcode</strong>
        <small>Scan barcode dengan scanner USB/Bluetooth. Produk langsung masuk keranjang; scan ulang menambah QTY.</small>
      </div>
      <input id="barcodeScanInput" class="pos-scanner-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Scan barcode di sini...">
    `;
    cartSection.insertBefore(panel, layout);

    const input = document.getElementById('barcodeScanInput');
    input?.addEventListener('keydown', async event => {
      if(event.key !== 'Enter') return;
      event.preventDefault();
      const code = input.value.trim();
      input.value = '';
      if(code) await processBarcode(code);
      setTimeout(() => input.focus(), 30);
    });
  }

  async function processBarcode(code){
    if(scannerBusy) return;
    scannerBusy = true;
    try{
      const response = await fetch(`barcode-lookup.php?code=${encodeURIComponent(code)}`, {credentials:'same-origin', cache:'no-store'});
      const data = await response.json().catch(() => ({ok:false,message:'Response barcode tidak valid'}));
      if(!response.ok || !data.ok) throw new Error(data.message || 'Barcode tidak ditemukan');
      const product = data.product;

      if(typeof products !== 'undefined' && Array.isArray(products)){
        const idx = products.findIndex(item => Number(item.id) === Number(product.id));
        if(idx >= 0) products[idx] = product;
        else products.push(product);
      }

      if(typeof addToCart === 'function'){
        addToCart(Number(product.id));
        if(typeof showToast === 'function') showToast(`${product.name} masuk keranjang.`);
      }
    }catch(error){
      if(typeof showToast === 'function') showToast(error.message || 'Barcode tidak ditemukan.');
      else alert(error.message || 'Barcode tidak ditemukan.');
    }finally{
      scannerBusy = false;
    }
  }

  function installGlobalScanner(){
    let buffer = '';
    let lastAt = 0;

    document.addEventListener('keydown', event => {
      const target = event.target;
      if(target?.id === 'barcodeScanInput') return;
      if(target?.matches?.('input,textarea,select,[contenteditable="true"]')) return;
      if(document.querySelector('.modal-overlay.active')) return;
      if(event.ctrlKey || event.altKey || event.metaKey) return;

      const now = performance.now();
      if(now - lastAt > 120) buffer = '';
      lastAt = now;

      if(event.key === 'Enter'){
        if(buffer.length >= 4){
          event.preventDefault();
          const code = buffer;
          buffer = '';
          processBarcode(code);
        }else{
          buffer = '';
        }
        return;
      }

      if(event.key.length === 1 && /^[0-9A-Za-z._-]$/.test(event.key)){
        buffer += event.key;
        if(buffer.length > 64) buffer = buffer.slice(-64);
      }
    }, true);
  }

  function receiptHtml(data){
    const sale = data.sale || {};
    const rows = (data.items || []).map(item => `
      <div class="item-name">${esc(item.name)}</div>
      <div class="line"><span>${Number(item.qty)} x ${rupiah(item.price).replace(/\s/g,' ')}</span><span>${rupiah(item.subtotal).replace(/\s/g,' ')}</span></div>
    `).join('');

    return `<!doctype html><html><head><meta charset="utf-8"><style>
      @page{size:58mm auto;margin:2mm}*{box-sizing:border-box}body{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;width:54mm;margin:0 auto;color:#000;font-size:9.5px;line-height:1.35}
      .center{text-align:center}.title{font-size:15px;font-weight:800}.muted{font-size:8.5px}.dash{border-top:1px dashed #000;margin:6px 0}.line{display:flex;justify-content:space-between;gap:6px}.item-name{font-weight:700;margin-top:4px}.total{font-size:11px;font-weight:800}.thanks{margin-top:10px;text-align:center}
    </style></head><body>
      <div class="center title">CAMILLA MARKET</div>
      <div class="center muted">Struk Pembayaran</div>
      <div class="dash"></div>
      <div>No: ${esc(sale.invoice_no || '')}</div>
      <div>Tgl: ${esc(sale.created_at || '')}</div>
      <div>Kasir: ${esc(sale.cashier || '')}</div>
      <div class="dash"></div>
      ${rows}
      <div class="dash"></div>
      <div class="line total"><span>TOTAL</span><span>${rupiah(sale.total)}</span></div>
      <div class="line"><span>BAYAR</span><span>${rupiah(sale.paid)}</span></div>
      <div class="line"><span>KEMBALI</span><span>${rupiah(sale.change)}</span></div>
      <div class="dash"></div>
      <div class="thanks">Terima kasih telah berbelanja<br>di Camilla Market</div>
    </body></html>`;
  }

  async function printReceipt(invoice){
    if(!invoice) return;
    try{
      const response = await fetch(`receipt.php?invoice=${encodeURIComponent(invoice)}`, {credentials:'same-origin', cache:'no-store'});
      const data = await response.json().catch(() => ({ok:false,message:'Response struk tidak valid'}));
      if(!response.ok || !data.ok) throw new Error(data.message || 'Struk tidak dapat dibuka');
      const html = receiptHtml(data);

      if(window.ReactNativeWebView?.postMessage){
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'PRINT_RECEIPT', invoice, html}));
        if(typeof showToast === 'function') showToast('Membuka menu printer...');
        return;
      }

      const frame = document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.right = '0';
      frame.style.bottom = '0';
      frame.style.width = '1px';
      frame.style.height = '1px';
      frame.style.border = '0';
      document.body.appendChild(frame);
      frame.srcdoc = html;
      frame.onload = () => {
        setTimeout(() => {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
          setTimeout(() => frame.remove(), 1200);
        }, 150);
      };
    }catch(error){
      alert(error.message || 'Gagal mencetak struk.');
    }
  }
  window.printCamillaReceipt = printReceipt;

  function injectCheckoutPrint(){
    const modal = document.getElementById('checkoutModal');
    const closeBtn = document.getElementById('closeCheckoutModal');
    if(!modal || !closeBtn || document.getElementById('posPrintReceiptBtn')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'posPrintReceiptBtn';
    btn.className = 'btn btn-block btn-secondary pos-print-btn';
    btn.textContent = '🖨️ Cetak Struk';
    btn.disabled = true;
    closeBtn.parentElement?.insertBefore(btn, closeBtn);
    btn.addEventListener('click', () => printReceipt(lastPrintedInvoice));

    const box = document.getElementById('receiptBox');
    if(box){
      new MutationObserver(() => {
        const text = box.textContent || '';
        const match = text.match(/TRX\d{8}\d{4,}/i);
        if(match){
          lastPrintedInvoice = match[0];
          btn.disabled = false;
        }
      }).observe(box, {childList:true,subtree:true,characterData:true});
    }
  }

  function enhanceHistory(){
    const list = document.getElementById('historyList');
    if(!list) return;

    const decorate = () => {
      list.querySelectorAll('.history-item').forEach(item => {
        if(item.querySelector('.history-print-btn')) return;
        const invoice = item.querySelector('strong')?.textContent?.trim();
        if(!invoice) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-secondary history-print-btn';
        btn.textContent = '🖨 Cetak Struk';
        btn.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          printReceipt(invoice);
        });
        item.lastElementChild?.appendChild(btn);
      });
    };

    new MutationObserver(decorate).observe(list, {childList:true,subtree:true});
    decorate();
  }

  function focusScannerWhenCartActive(){
    const observer = new MutationObserver(() => {
      const cartSection = document.getElementById('cart');
      if(cartSection?.classList.contains('active')){
        setTimeout(() => document.getElementById('barcodeScanInput')?.focus(), 120);
      }
    });
    document.querySelectorAll('.page-section').forEach(section => observer.observe(section, {attributes:true,attributeFilter:['class']}));
  }

  addStyles();
  injectProductImport();
  injectScanner();
  injectCheckoutPrint();
  enhanceHistory();
  installGlobalScanner();
  focusScannerWhenCartActive();

  const bodyObserver = new MutationObserver(() => syncImportButtons());
  bodyObserver.observe(document.body, {attributes:true,attributeFilter:['class']});
  setInterval(syncImportButtons, 1500);
})();
