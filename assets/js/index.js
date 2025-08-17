// Dark/Light mode
(function(){
  const modeBtn = document.getElementById('modeBtn');
  const html = document.documentElement;
  if(localStorage.getItem('theme')==='light'){ html.classList.remove('dark'); }
  modeBtn?.addEventListener('click', ()=>{
    html.classList.toggle('dark');
    localStorage.setItem('theme', html.classList.contains('dark')?'dark':'light');
  });
})();

function formatCurrency(n){ return new Intl.NumberFormat(undefined, {style:'currency', currency:'USD'}).format(n); }

function renderReceipt(inv){
  document.getElementById('rInvoice').textContent = inv.number;
  document.getElementById('rDate').textContent = new Date(inv.date).toLocaleDateString();
  const bill = inv.billTo || {};
  const rec = inv.recipient || {};
  document.getElementById('rBillTo').innerHTML = [bill.name, bill.phone, bill.email, bill.address].filter(Boolean).join('<br/>');
  document.getElementById('rRecipient').innerHTML = [rec.name, rec.phone, rec.email, rec.address].filter(Boolean).join('<br/>');

  const tbody = document.getElementById('rItems');
  tbody.innerHTML='';
  let sub = 0;
  (inv.items||[]).forEach(it=>{
    const row = document.createElement('tr');
    const total = (it.qty||0) * (it.price||0);
    sub += total;
    row.innerHTML = `
      <td class="p-3">${it.name||''}</td>
      <td class="p-3 text-right">${it.qty||0}</td>
      <td class="p-3 text-right">${formatCurrency(it.price||0)}</td>
      <td class="p-3 text-right">${formatCurrency(total)}</td>`;
    tbody.appendChild(row);
  });
  const tax = +inv.tax || 0;
  const taxAmt = sub * (tax/100);
  const total = sub + taxAmt;
  document.getElementById('rSub').textContent = formatCurrency(sub);
  document.getElementById('rTax').textContent = `${formatCurrency(taxAmt)} (${tax}%)`;
  document.getElementById('rTotal').textContent = formatCurrency(total);
  document.getElementById('rNotes').textContent = inv.notes || '—';

  const link = DB.linkFor(inv.number);
  document.getElementById('openLink').href = link;
  const canvas = document.getElementById('qr');
  QRCode.toCanvas(canvas, link, {width:64, margin:0}, ()=>{});
}

function showResult(found){
  const res = document.getElementById('result');
  const nf = document.getElementById('notFound');
  if(found){ res.classList.remove('hidden'); nf.classList.add('hidden'); }
  else { res.classList.add('hidden'); nf.classList.remove('hidden'); }
}

document.getElementById('verifyForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const num = new FormData(e.target).get('invoice').trim();
  const inv = DB.getByNumber(num);
  if(inv){ renderReceipt(inv); showResult(true); }
  else { showResult(false); }
});

// support direct link: index.html?id=INV-NO
(function(){
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if(id){
    const inv = DB.getByNumber(id);
    if(inv){ renderReceipt(inv); showResult(true); }
  }
})();

document.getElementById('printBtn')?.addEventListener('click', ()=> window.print());
