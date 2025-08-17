document.addEventListener('DOMContentLoaded', function() {
  
  const php = n => new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(n||0));
  const formatDisplayDate = d => {
    if(!d) return "—"; const x=new Date(d+'T00:00:00'); 
    return x.toLocaleDateString('en-US',{weekday:'short',month:'long',day:'numeric',year:'numeric'});
  };
  const formatDisplayTime = t => {
    if(!t) return "—"; const x=new Date(t); 
    return x.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
  };
  const phonePretty = v => {
    let s = String(v||"").replace(/[^0-9]/g, "").slice(0,11); 
    let out=""; if(s){ out += s.slice(0,4); if(s.length>4) out += " "+s.slice(4,7); if(s.length>7) out += " "+s.slice(7); } return out;
  };
  const calcTotals = inv => {
    let subtotal=0, totalTax=0, totalDisc=0;
    (inv.items||[]).forEach(it=>{
      const base=(it.rate||0)*(it.qty||0);
      subtotal+=base;
      totalTax+=base*((it.tax||0)/100);
      totalDisc+=(it.discount||0);
    });
    const total=subtotal+totalTax-totalDisc;
    const due=total-(inv.downpayment||0);
    return {subtotal,totalTax,totalDisc,total,due};
  };

  const params = new URLSearchParams(window.location.search);
  const invoiceId = params.get('id');
  const invoiceContainer = document.querySelector('.invoice-container');
  const errorMsg = document.getElementById('error-msg');
  
  if (!invoiceId) {
    if(invoiceContainer) invoiceContainer.style.display = 'none';
    errorMsg.classList.remove('hidden');
    return;
  }

  const invoice = DB.getByNumber(invoiceId);

  if (!invoice) {
    if(invoiceContainer) invoiceContainer.style.display = 'none';
    errorMsg.classList.remove('hidden');
    return;
  }

  const t = calcTotals(invoice);

  document.getElementById('pInv').textContent = invoice.number || "—";
  document.getElementById('pDate').textContent= formatDisplayDate(invoice.date);
  document.getElementById('pTime').textContent= formatDisplayTime(invoice.timestamp);
  document.getElementById('pCompanyName').textContent = invoice.recipient.name || "Your Company";
  document.getElementById('pBill').innerText = [invoice.billTo.name, invoice.billTo.address, phonePretty(invoice.billTo.phone), invoice.billTo.email].filter(Boolean).join("\n") || "—";
  document.getElementById('pRecipient').innerText = [invoice.recipient.name, invoice.recipient.address, phonePretty(invoice.recipient.phone), invoice.recipient.email, invoice.recipient.website, invoice.recipient.facebook].filter(Boolean).join("\n") || "—";
  document.getElementById('pSub').textContent=php(t.subtotal);
  document.getElementById('pDis').textContent=php(t.totalDisc);
  document.getElementById('pTax').textContent=php(t.totalTax);
  document.getElementById('pDP').textContent =php(invoice.downpayment);
  document.getElementById('pDue').textContent=php(t.due);
  document.getElementById('pNotes').innerText = invoice.notes || "Please make payment by the due date.";
  const p = invoice.payment || {};
  const payText = [ p.method||"", `A/N: ${p.name||""}`, p.gcash?`GCash: ${phonePretty(p.gcash)}`:null, p.maya? `Maya: ${phonePretty(p.maya)}`:null ].filter(Boolean).join("\n");
  document.getElementById('pPayment').innerText = payText || "—";
  
  const qrImg = document.getElementById('pQR');
  const link = DB.linkFor(invoice.number);
  const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=${encodeURIComponent(link)}&qzone=1&bgcolor=ffffff`;
  qrImg.src = apiUrl;
  qrImg.style.display = 'block';
  
  const pItems = document.getElementById('pItems');
  pItems.innerHTML="";
  invoice.items.forEach(it=>{
    const amt=(it.rate||0)*(it.qty||0)*(1+(it.tax||0)/100)-(it.discount||0);
    pItems.innerHTML += `
    <tr class="border-b border-slate-200 last:border-0"> 
      <td class="py-2 px-2 break-words">${it.desc||""}</td>
      <td class="py-2 px-2 text-right break-words">${php(it.rate||0)}</td>
      <td class="py-2 px-2 text-right break-words">${it.qty||0}</td>
      <td class="py-2 px-2 text-right font-medium break-words">${php(amt)}</td>
    </tr>`;
  });

  lucide.createIcons();
  
  if (params.get('autoprint') === '1') {
    setTimeout(() => { window.print(); }, 500);
  }
  
  document.getElementById('printBtn').addEventListener('click', () => {
    window.print();
  });
});