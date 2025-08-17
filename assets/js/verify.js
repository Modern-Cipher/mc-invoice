import { db } from './firebase-init.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', function() {
  
  const statusBox = document.getElementById('status-box');
  const statusIconWrapper = document.getElementById('status-icon-wrapper');
  const statusTitle = document.getElementById('status-title');
  const statusDesc = document.getElementById('status-desc');
  const invoiceWrapper = document.getElementById('invoice-wrapper');
  
  // Helper Functions
  const php = n => new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(n||0));
  const formatDisplayDate = d => { if(!d) return "—"; const x=new Date(d+'T00:00:00'); return x.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}); };
  const formatDisplayTime = t => { if(!t) return "—"; const x=new Date(t); return x.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true}); };
  const phonePretty = v => { let s = String(v||"").replace(/[^0-9]/g, "").slice(0,11); let out=""; if(s){ out += s.slice(0,4); if(s.length>4) out += " "+s.slice(4,7); if(s.length>7) out += " "+s.slice(7); } return out; };
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
  const getLinkFor = num => `${location.origin}${location.pathname}?id=${encodeURIComponent(num)}`;

  // Function to display error message
  function showStatus(type, title, message, icon) {
      statusBox.classList.add(type);
      statusTitle.textContent = title;
      statusDesc.textContent = message;
      statusIconWrapper.innerHTML = `<i data-lucide="${icon}" class="w-8 h-8"></i>`;
      lucide.createIcons();
  }

  // Function to render the invoice data
  function displayInvoice(invoice) {
    statusBox.classList.add('verified');
    statusTitle.textContent = 'Invoice Verified & Authentic';
    statusDesc.textContent = `This invoice is authentic and has been successfully retrieved from our records.`;
    statusIconWrapper.innerHTML = '<i data-lucide="check-circle-2" class="w-8 h-8"></i>';
    invoiceWrapper.classList.remove('hidden');
    
    lucide.createIcons();

    // ===== ITO ANG LOGIC PARA SA "PAID/UNPAID" STAMP =====
    const stampContainer = document.getElementById('statusStamp');
    if (stampContainer && invoice.status) {
        if (invoice.status === 'Paid') {
            stampContainer.innerHTML = `<div class="status-stamp paid">Paid</div>`;
        } else if (invoice.status === 'Unpaid') {
            stampContainer.innerHTML = `<div class="status-stamp unpaid">Unpaid</div>`;
        }
    }
    // =======================================================

    const t = calcTotals(invoice);
    document.title = `Verified: ${invoice.number}`;
    document.getElementById('pCompanyName').textContent = invoice.recipient.name || "—";
    document.getElementById('pInv').textContent = invoice.number || "—";
    document.getElementById('pDate').textContent= formatDisplayDate(invoice.date);
    document.getElementById('pTime').textContent= formatDisplayTime(invoice.timestamp);
    document.getElementById('pBill').innerText = [invoice.billTo.name, invoice.billTo.address, phonePretty(invoice.billTo.phone), invoice.billTo.email].filter(Boolean).join("\n") || "—";
    document.getElementById('pRecipient').innerText = [invoice.recipient.name, invoice.recipient.address, phonePretty(invoice.recipient.phone), invoice.recipient.email, invoice.recipient.website, invoice.recipient.facebook].filter(Boolean).join("\n") || "—";
    document.getElementById('pSub').textContent=php(t.subtotal);
    document.getElementById('pDis').textContent=php(t.totalDisc);
    document.getElementById('pTax').textContent=php(t.totalTax);
    document.getElementById('pDP').textContent =php(invoice.downpayment);
    document.getElementById('pDue').textContent=php(t.due);
    document.getElementById('pNotes').innerText = invoice.notes || "—";
    const p = invoice.payment || {};
    const payText = [ p.method||"", `A/N: ${p.name||""}`, p.gcash?`GCash: ${phonePretty(p.gcash)}`:null, p.maya? `Maya: ${phonePretty(p.maya)}`:null ].filter(Boolean).join("\n");
    document.getElementById('pPayment').innerText = payText || "—";
    
    const pItems = document.getElementById('pItems');
    pItems.innerHTML="";
    invoice.items.forEach(it=>{
      const amt=(it.rate||0)*(it.qty||0)*(1+(it.tax||0)/100)-(it.discount||0);
      pItems.innerHTML += `<tr class="border-b border-slate-200 dark:border-slate-700 last:border-0"> 
        <td class="p-2 break-words">${it.desc||""}</td>
        <td class="p-2 text-right break-words">${php(it.rate||0)}</td>
        <td class="p-2 text-right break-words">${it.qty||0}</td>
        <td class="p-2 text-right font-medium break-words">${php(amt)}</td>
      </tr>`;
    });
    
    const qrImg = document.getElementById('pQR');
    if(qrImg) {
      const link = getLinkFor(invoice.number);
      const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=${encodeURIComponent(link)}&qzone=1&bgcolor=ffffff`;
      qrImg.src = apiUrl;
      qrImg.style.display = 'block';
    }
  }

  // Main async function to fetch data from Firebase
  async function verifyInvoice(invoiceId) {
    try {
        const docRef = doc(db, "invoices", invoiceId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const invoice = docSnap.data();
            displayInvoice(invoice);
        } else {
            showStatus('invalid', 'Invoice Not Found', `The invoice "${invoiceId}" could not be found.`, 'alert-triangle');
        }
    } catch (error) {
        console.error("Error fetching invoice:", error);
        showStatus('invalid', 'Connection Error', 'Could not connect to the database to verify the invoice.', 'wifi-off');
    }
  }

  // Get invoice ID from URL and start verification
  const params = new URLSearchParams(window.location.search);
  const invoiceId = params.get('id');

  if (!invoiceId) {
    showStatus('invalid', 'Invalid Link', 'No invoice ID found in the URL.', 'x-circle');
    return;
  }

  // Call the main function
  verifyInvoice(invoiceId);

  // --- Theme Switcher and Print Button ---
  document.getElementById('printBtn').addEventListener('click', () => window.print());

  const themeSwitch = document.getElementById('theme-switch');
  const applyTheme = (isDark) => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      themeSwitch.checked = true;
    } else {
      document.documentElement.classList.remove('dark');
      themeSwitch.checked = false;
    }
  };

  const savedTheme = localStorage.getItem('theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (savedTheme) {
    applyTheme(savedTheme === 'dark');
  } else {
    applyTheme(systemPrefersDark);
  }

  themeSwitch.addEventListener('change', () => {
    const isDark = themeSwitch.checked;
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    applyTheme(isDark);
  });
  
  lucide.createIcons();
});