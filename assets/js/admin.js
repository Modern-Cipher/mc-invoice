import { db } from './firebase-init.js';
import { collection, doc, setDoc, getDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ===== PASTE MO DITO ANG IYONG WEB APP URL MULA SA APPS SCRIPT =====
const APPS_SCRIPT_WEB_APP_URL = "PASTE_YOUR_WEB_APP_URL_HERE";
// ====================================================================

// ================== CONFIG & DEFAULTS ==================
const CONFIG_KEY = "mc_invoice_config_local_cache";
const settingsDocRef = doc(db, "settings", "default");
let appConfig = {};

function getHardcodedDefaults() {
  return {
    prefix: "MC",
    recipient: { name: "Modern Cipher", address: "Central Luzon, Philippines", phone: "09764244902", email: "contact@moderncipher.com", website: "modern-cipher.github.io/services/", facebook: "facebook.com/moderncipher" },
    payment: { method: "E-Wallet", name: "Menard Dela Cruz", gcash: "09764244902", maya: "09397114051" }
  };
}

async function initializeConfig() {
  try {
    const docSnap = await getDoc(settingsDocRef);
    if (docSnap.exists()) {
      appConfig = docSnap.data();
      localStorage.setItem(CONFIG_KEY, JSON.stringify(appConfig));
    } else {
      appConfig = getHardcodedDefaults();
      await setDoc(settingsDocRef, appConfig);
      localStorage.setItem(CONFIG_KEY, JSON.stringify(appConfig));
    }
  } catch (error) {
    console.error("Firebase connection error. Loading settings from local cache.", error);
    const cachedSettings = localStorage.getItem(CONFIG_KEY);
    appConfig = cachedSettings ? JSON.parse(cachedSettings) : getHardcodedDefaults();
  }
}

async function saveConfig(cfg) {
  try {
    await setDoc(settingsDocRef, cfg);
    appConfig = cfg;
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    Toast.fire({ icon: 'success', title: 'Settings saved to Firebase!' });
  } catch (error) {
    console.error("Error saving settings:", error);
    Swal.fire('Error', 'Could not save settings. Please check your connection.', 'error');
  }
}

function getConfig() {
  return appConfig;
}

// ================== HELPERS ==================
const $ = id => document.getElementById(id);
const digitsOnly = s => String(s||"").replace(/[^0-9]/g, "");
function rand6(){ const s="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let o=""; for(let i=0;i<6;i++) o+=s[Math.floor(Math.random()*s.length)]; return o; }
function genInvoiceNo(){ const d=new Date(); const ym=d.getFullYear()+String(d.getMonth()+1).padStart(2,'0'); return `${getConfig().prefix}-${ym}-${rand6()}`; }
function php(n){ return new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(n||0)); }
function formatDisplayDate(d){ if(!d) return "—"; const x=new Date(d+'T00:00:00'); return x.toLocaleDateString('en-US',{weekday:'short',month:'long',day:'numeric',year:'numeric'}); }
function formatDisplayTime(t){ if(!t) return "—"; const x=new Date(t); return x.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true}); }
function phonePretty(v){ let s = digitsOnly(v).slice(0,11); let out=""; if(s){ out += s.slice(0,4); if(s.length>4) out += " "+s.slice(4,7); if(s.length>7) out += " "+s.slice(7); } return out; }

const Toast = Swal.mixin({ toast:true, position:'top-end', showConfirmButton:false, timer:1600, timerProgressBar:true });

(function(){
  const btn=$("modeBtn");
  if(localStorage.getItem("theme")==="light") document.documentElement.classList.remove("dark");
  btn?.addEventListener("click", ()=>{
    document.documentElement.classList.toggle("dark");
    localStorage.setItem("theme", document.documentElement.classList.contains("dark")?'dark':'light');
  });
})();

// ================== SETTINGS MODAL ==================
const cfgModal=$("cfgModal"), cfgForm=$("cfgForm");
$("cfgBtn")?.addEventListener("click", ()=>{
  const c=getConfig();
  cfgForm.querySelector('[name="prefix"]').value=c.prefix;
  Object.keys(c.recipient).forEach(k=> cfgForm.querySelector(`[name="recipient_${k}"]`).value = (k==='phone')?phonePretty(c.recipient[k]):(c.recipient[k]||""));
  Object.keys(c.payment).forEach(k=> cfgForm.querySelector(`[name="payment_${k}"]`).value = (k==='gcash'||k==='maya')?phonePretty(c.payment[k]):(c.payment[k]||""));
  cfgModal.classList.remove("hidden");
});
$("cfgClose")?.addEventListener("click", ()=> cfgModal.classList.add("hidden"));
$("cfgSave")?.addEventListener("click", async ()=>{
  const f = new FormData(cfgForm);
  const cfg={
    prefix: f.get('prefix'),
    recipient:{ name:f.get('recipient_name'), address:f.get('recipient_address'), phone:digitsOnly(f.get('recipient_phone')), email:f.get('recipient_email'), website:f.get('recipient_website'), facebook:f.get('recipient_facebook') },
    payment:{ method:f.get('payment_method'), name:f.get('payment_name'), gcash:digitsOnly(f.get('payment_gcash')), maya:digitsOnly(f.get('payment_maya')) }
  };
  await saveConfig(cfg);
  cfgModal.classList.add("hidden");
});

// ================== MAIN MODAL & PREVIEW ==================
const modal=$("modal"), invForm=$("invForm"), itemsWrap=$("items"),
      pInv=$("pInv"), pDate=$("pDate"), pTime=$("pTime"), pBill=$("pBill"),
      pRecipient=$("pRecipient"), pItems=$("pItems"), pCompanyName=$("pCompanyName"),
      pCompanyNameMobile=$("pCompanyNameMobile"),
      pSub=$("pSub"), pDis=$("pDis"), pTax=$("pTax"), pDP=$("pDP"), pDue=$("pDue"),
      pNotes=$("pNotes"), pPayment=$("pPayment"), pQR=$("pQR");

(function(){
  const sidebar   = document.getElementById('sidebar');
  const backdrop  = document.getElementById('sidebarBackdrop');
  const toggler   = document.getElementById('sidebarToggle');
  function openSidebar(){ sidebar.classList.remove('-translate-x-full'); backdrop.classList.remove('hidden'); }
  function closeSidebar(){ sidebar.classList.add('-translate-x-full'); backdrop.classList.add('hidden'); }
  toggler?.addEventListener('click', openSidebar);
  backdrop?.addEventListener('click', closeSidebar);
})();

function updateItemButtons(){
  const rows = itemsWrap.children;
  for(let i=0;i<rows.length;i++){
    rows[i].querySelector('.remove-item-btn').style.visibility = rows.length>1?'visible':'hidden';
    rows[i].querySelector('.add-item-btn').style.visibility    = (i===rows.length-1)?'visible':'hidden';
  }
}

function addItemRow(data={desc:"",rate:"",qty:"1",tax:"",discount:""}){
  const row=document.createElement("div");
  row.className="item-row grid grid-cols-12 gap-2 items-center";
  row.innerHTML=`
    <input class="col-span-5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800"
           placeholder="Description" value="${data.desc||""}"/>
    <input data-validate="currency" type="text" inputmode="decimal"
           class="col-span-2 text-right px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800"
           placeholder="0.00" value="${data.rate||""}"/>
    <input data-validate="qty" type="text" inputmode="numeric"
           class="col-span-1 text-right px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800"
           placeholder="1" value="${data.qty||"1"}"/>
    <input data-validate="currency" type="text" inputmode="decimal"
           class="col-span-1 text-right px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800"
           placeholder="0" value="${data.tax||""}"/>
    <input data-validate="currency" type="text" inputmode="decimal"
           class="col-span-1 text-right px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800"
           placeholder="0.00" value="${data.discount||""}"/>
    <div class="col-span-2 flex items-center justify-end gap-1 min-w-0">
      <div class="amount w-full text-right font-medium min-w-0 truncate" title="₱0.00">₱0.00</div>
      <button type="button" class="remove-item-btn text-red-500 hover:bg-red-500/10 p-1 rounded-md transition" data-tippy-content="Remove Item">
        <i data-lucide="minus-circle" class="w-5 h-5"></i>
      </button>
      <button type="button" class="add-item-btn text-green-500 hover:bg-green-500/10 p-1 rounded-md transition" data-tippy-content="Add Item">
        <i data-lucide="plus-circle" class="w-5 h-5"></i>
      </button>
    </div>
  `;
  itemsWrap.appendChild(row);

  row.querySelector(".remove-item-btn").addEventListener("click", ()=>{
    row.remove(); updateItemButtons(); updatePreviewFromForm();
  });
  row.querySelector(".add-item-btn").addEventListener("click", ()=>{
    addItemRow();
  });
  row.querySelectorAll("input").forEach(i=>{
    i.addEventListener("focus", ()=>{ if(i.dataset.validate!=='phone' && (i.value==="0"||i.value==="0.00")) i.value=""; });
    i.addEventListener("input", (e)=>{ applyInputValidation(e); updatePreviewFromForm(); });
    i.addEventListener("blur",  ()=>{ if(i.dataset.validate!=='phone' && i.value==="") i.value=""; });
  });

  updateItemButtons();
  if (window.lucide) lucide.createIcons();
  if (window.tippy) tippy('[data-tippy-content]');
  updatePreviewFromForm();
}

function collectForm(){
  const f = new FormData(invForm);
  const ensurePay = (o)=>({method:"",name:"",gcash:"",maya:"",...(o||{})});
  return {
    id: f.get("id"),
    number: f.get("number"),
    date: f.get("date"),
    status: f.get("status") || "Unpaid",
    timestamp: invForm.querySelector('[name="timestamp"]').value,
    billTo: { name:f.get('bill_name'), email:f.get('bill_email'), phone:digitsOnly(f.get('bill_phone')), address:f.get('bill_address') },
    recipient: { name:f.get('recipient_name'), address:f.get('recipient_address'), phone:digitsOnly(f.get('recipient_phone')), email:f.get('recipient_email'), website:f.get('recipient_website'), facebook:f.get('recipient_facebook') },
    payment: ensurePay({ method:f.get('payment_method'), name:f.get('payment_name'), gcash:digitsOnly(f.get('payment_gcash')), maya:digitsOnly(f.get('payment_maya')) }),
    items: Array.from(itemsWrap.children).map(row=>{
      const [desc,rate,qty,tax,discount]=row.querySelectorAll("input");
      return {
        desc: desc.value, rate: parseFloat(rate.value)||0, qty:  parseInt(qty.value)||0,
        tax:  parseFloat(tax.value)||0, discount: parseFloat(discount.value)||0
      };
    }),
    downpayment: parseFloat(f.get("downpayment"))||0,
    notes: f.get("notes")||""
  };
}

function calcTotals(inv){
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
}

function updatePreviewFromForm(){
  const inv=collectForm();
  Array.from(itemsWrap.children).forEach(row=>{
    const [,rate,qty,tax,discount]=row.querySelectorAll("input");
    const amt = (parseFloat(rate.value)||0)*(parseInt(qty.value)||0)*(1+((parseFloat(tax.value)||0)/100))-(parseFloat(discount.value)||0);
    row.querySelector(".amount").textContent = php(amt);
    row.querySelector(".amount").title = php(amt);
  });
  const t=calcTotals(inv);
  pInv.textContent = inv.number || "—";
  pDate.textContent= formatDisplayDate(inv.date);
  pTime.textContent= formatDisplayTime(inv.timestamp);
  pCompanyName.textContent = inv.recipient.name || "Your Company";
  if(pCompanyNameMobile) pCompanyNameMobile.textContent = inv.recipient.name || "Your Company";
  pBill.innerText = [inv.billTo.name, inv.billTo.address, phonePretty(inv.billTo.phone), inv.billTo.email].filter(Boolean).join("\n") || "—";
  pRecipient.innerText = [inv.recipient.name, inv.recipient.address, phonePretty(inv.recipient.phone), inv.recipient.email, inv.recipient.website, inv.recipient.facebook].filter(Boolean).join("\n") || "—";
  pItems.innerHTML="";
  inv.items.forEach(it=>{
    const amt=(it.rate||0)*(it.qty||0)*(1+(it.tax||0)/100)-(it.discount||0);
    pItems.innerHTML += `<tr>
      <td class="p-2 w-[40%]">${it.desc||""}</td>
      <td class="p-2 text-right w-[20%]">${php(it.rate||0)}</td>
      <td class="p-2 text-right w-[15%]">${it.qty||0}</td>
      <td class="p-2 text-right font-medium w-[25%]">${php(amt)}</td>
    </tr>`;
  });
  pSub.textContent=php(t.subtotal);
  pDis.textContent=php(t.totalDisc);
  pTax.textContent=php(t.totalTax);
  pDP.textContent =php(inv.downpayment);
  pDue.textContent=php(t.due);
  pNotes.innerText = inv.notes || "—";
  const p = inv.payment || {};
  const payText = [ p.method||"", `A/N: ${p.name||""}`, p.gcash?`GCash: ${phonePretty(p.gcash)}`:null, p.maya? `Maya: ${phonePretty(p.maya)}`:null ].filter(Boolean).join("\n");
  pPayment.innerText = payText || "—";
  if(inv.number){
    const link = getLinkFor(inv.number);
    const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=${encodeURIComponent(link)}&qzone=1&bgcolor=ffffff`;
    pQR.src=apiUrl; pQR.style.display='block';
  } else { pQR.style.display='none'; }
}

function openModal(existing){
  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
  invForm.reset(); itemsWrap.innerHTML="";
  const def=getConfig();
  const data = existing ? JSON.parse(JSON.stringify(existing)) : { recipient:def.recipient, payment:def.payment, billTo:{}, items:[{}], timestamp:"" };
  invForm.querySelector('[name="id"]').value = existing ? data.id : "";
  $("fNumber").value = existing?data.number:"";
  $("fDate").value   = existing?data.date  :new Date().toISOString().slice(0,10);
  invForm.querySelector('[name="status"]').value = data.status || "Unpaid";
  $("modalTitle").textContent = existing ? "Edit Invoice" : "Add Invoice";
  invForm.querySelector('[name="timestamp"]').value = data.timestamp || "";
  ["name","address","phone","email","website","facebook"].forEach(k=>{ const v = data.recipient[k] || ""; invForm.querySelector(`[name="recipient_${k}"]`).value = (k==="phone")?phonePretty(v):v; });
  ["method","name","gcash","maya"].forEach(k=>{ const v = (data.payment||{})[k] || ""; invForm.querySelector(`[name="payment_${k}"]`).value = (k==="gcash"||k==="maya")?phonePretty(v):v; });
  ["name","email","phone","address"].forEach(k=>{ const v = (data.billTo||{})[k] || ""; invForm.querySelector(`[name="bill_${k}"]`).value = (k==="phone")?phonePretty(v):v; });
  invForm.querySelector('[name="downpayment"]').value = (data.downpayment??"") || "";
  invForm.querySelector('[name="notes"]').value = data.notes || "Please make payment by the due date.";
  const list = (data.items && data.items.length? data.items : [{}]);
  list.forEach(it=> addItemRow({
    desc: it.desc||"",
    rate: (it.rate ?? "") === "" ? "" : String(it.rate),
    qty:  (it.qty  ?? "") === "" ? "" : String(it.qty),
    tax:  (it.tax  ?? "") === "" ? "" : String(it.tax),
    discount: (it.discount ?? "") === "" ? "" : String(it.discount)
  }));
  updatePreviewFromForm();
  setTimeout(()=> { if (window.lucide) lucide.createIcons(); if (window.tippy) tippy('[data-tippy-content]'); },0);
}
function closeModalFn(){ modal.classList.add("hidden"); document.body.classList.remove("overflow-hidden"); }

$("addBtn")?.addEventListener("click", ()=> openModal());
$("closeModal")?.addEventListener("click", closeModalFn);
$("cancelBtn")?.addEventListener("click", closeModalFn);
$("regenNum")?.addEventListener("click", ()=>{
  $("fNumber").value = genInvoiceNo();
  invForm.querySelector('[name="timestamp"]').value = new Date().toISOString();
  updatePreviewFromForm();
});

function sanitizeDecimal(str){
  let s = String(str||"").replace(/[^0-9.]/g,'');
  const parts = s.split('.');
  s = parts.shift().replace(/^0+(?=\d)/,'') + (parts.length?'.'+parts.join('').replace(/\./g,''): '');
  if(s.startsWith('.')) s = '0'+s;
  const [intPart, decPart] = s.split('.');
  return decPart !== undefined ? intPart + '.' + decPart.slice(0,2) : intPart;
}
function sanitizeInt(str){ return String(str||"").replace(/[^0-9]/g,'').replace(/^0+(?=\d)/,''); }
function applyInputValidation(e){
  const el = e.target;
  const t  = el.dataset.validate;
  if(!t) return;
  if(t==='phone'){ el.value = phonePretty(el.value); }
  else if(t==='currency'){ el.value = sanitizeDecimal(el.value); }
  else if(t==='qty'){ el.value = sanitizeInt(el.value); }
  try { el.setSelectionRange(el.value.length, el.value.length); } catch {}
}
invForm?.addEventListener('input', (e)=>{ applyInputValidation(e); updatePreviewFromForm(); });
cfgForm?.addEventListener('input', applyInputValidation);

// ================== FIREBASE FUNCTIONS & TABLE ==================
const invoicesCol = collection(db, "invoices");

async function saveInvoice(invoiceData) {
    const docId = invoiceData.id || invoiceData.number;
    const docRef = doc(invoicesCol, docId);
    delete invoiceData.id; 
    await setDoc(docRef, invoiceData);
}

invForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const invoiceData = collectForm();
    if (!invoiceData.number) {
        Toast.fire({icon: 'error', title: 'Please generate an invoice number'});
        return;
    }
    
    try {
        await saveInvoice(invoiceData);
        Toast.fire({icon: 'success', title: 'Invoice saved!'});
        closeModalFn();
    } catch (error) {
        console.error("Error saving invoice: ", error);
        Swal.fire({icon: 'error', title: 'Oops...', text: 'Something went wrong!'});
    }
});

function renderTable(allInvoices) {
    const main = document.querySelector('main');
    if (!main.querySelector('#invoiceTableContainer')) {
        main.innerHTML = `
        <div id="invoiceTableContainer" class="w-full">
            <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 class="text-lg font-semibold">All Invoices</h2>
                <div class="relative w-full sm:w-72">
                    <input id="searchInput" type="text" placeholder="Search invoices..." class="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-brand-600 outline-none transition">
                    <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"></i>
                </div>
            </div>
            <div class="overflow-x-auto w-full rounded-lg border border-slate-200 dark:border-slate-800">
                <table class="w-full text-sm">
                    <thead class="bg-slate-50 dark:bg-slate-900/40">
                        <tr>
                            <th class="text-left px-4 py-3 font-semibold whitespace-nowrap">Invoice #</th>
                            <th class="text-left px-4 py-3 font-semibold whitespace-nowrap">Status</th>
                            <th class="text-left px-4 py-3 font-semibold whitespace-nowrap">Client/Company</th>
                            <th class="text-left px-4 py-3 font-semibold whitespace-nowrap">Date Issued</th>
                            <th class="text-right px-4 py-3 font-semibold whitespace-nowrap">Total</th>
                            <th class="text-right px-4 py-3 font-semibold whitespace-nowrap">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="rows" class="divide-y divide-slate-200 dark:divide-slate-800"></tbody>
                </table>
            </div>
        </div>`;
    }

    const rows = document.getElementById("rows");
    rows.innerHTML = "";

    if (allInvoices.length === 0) {
        rows.innerHTML = `<tr><td colspan="6" class="text-center p-8 text-slate-500">No invoices yet.</td></tr>`;
    } else {
        allInvoices.sort((a, b) => new Date(b.date) - new Date(a.date));
        allInvoices.forEach((inv) => {
            const { total } = calcTotals(inv);
            const link = getLinkFor(inv.number);
            
            let statusBadge = '';
            if (inv.status === 'Paid') {
                statusBadge = `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-400">Paid</span>`;
            } else {
                statusBadge = `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400">Unpaid</span>`;
            }

            const tr = document.createElement("tr");
            tr.className = "hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors";
            tr.dataset.search = [inv.number, inv.status, inv.billTo?.name || "", formatDisplayDate(inv.date)].join(" ").toLowerCase();
            tr.innerHTML = `
                <td class="px-4 py-3 font-medium text-brand-600 dark:text-sky-400 truncate">${inv.number}</td>
                <td class="px-4 py-3">${statusBadge}</td>
                <td class="px-4 py-3 truncate">${inv.billTo?.name || "-"}</td>
                <td class="px-4 py-3 truncate">${formatDisplayDate(inv.date)}</td>
                <td class="px-4 py-3 text-right font-semibold">${php(total)}</td>
                <td class="px-4 py-3">
                    <div class="flex items-center justify-end gap-2">
                        <a href="${link}" target="_blank" class="p-2 rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" data-tippy-content="View Invoice"><i data-lucide="external-link" class="w-4 h-4"></i></a>
                        <button class="act email p-2 rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" data-tippy-content="Send Email"><i data-lucide="mail" class="w-4 h-4"></i></button>
                        <button class="act edit p-2 rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" data-tippy-content="Edit"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                        <button class="act del p-2 rounded-lg ring-1 ring-red-400 text-red-500 hover:bg-red-500/10 hover:text-red-600 transition-colors" data-tippy-content="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </div>
                </td>`;
            rows.appendChild(tr);

            tr.querySelector(".email").addEventListener("click", () => sendInvoiceByEmail(inv));
            tr.querySelector(".edit").addEventListener("click", () => openModal(inv));
            tr.querySelector(".del").addEventListener("click", async () => {
                const r = await Swal.fire({ icon: 'warning', title: 'Delete invoice?', text: inv.number, showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Yes, delete it' });
                if (r.isConfirmed) {
                    try {
                        await deleteDoc(doc(invoicesCol, inv.id));
                        Toast.fire({ icon: 'success', title: 'Invoice deleted' });
                    } catch (error) {
                        Swal.fire({icon: 'error', title: 'Oops...', text: 'Could not delete invoice.'});
                    }
                }
            });
        });
    }

    const si = document.getElementById("searchInput");
    si.oninput = () => { const q = si.value.toLowerCase(); [...rows.children].forEach(tr => tr.style.display = (tr.dataset.search || '').includes(q) ? "" : "none"); };

    if (window.lucide) lucide.createIcons();
    if (window.tippy) tippy('[data-tippy-content]');
}

async function sendInvoiceByEmail(invoice) {
    if (!invoice.billTo || !invoice.billTo.email) {
        return Swal.fire('Error', 'This client does not have an email address.', 'error');
    }
    if (!APPS_SCRIPT_WEB_APP_URL || APPS_SCRIPT_WEB_APP_URL === "PASTE_YOUR_WEB_APP_URL_HERE") {
        return Swal.fire('Setup Required', 'Please paste your Google Apps Script Web App URL at the top of admin.js file.', 'warning');
    }

    const { value: isConfirmed } = await Swal.fire({
        title: 'Send Invoice?',
        text: `This will send invoice ${invoice.number} to ${invoice.billTo.email}.`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, send it!',
        cancelButtonText: 'Cancel'
    });

    if (!isConfirmed) return;

    Swal.fire({
        title: 'Sending Email...',
        text: 'Please wait. This may take a moment.',
        didOpen: () => { Swal.showLoading(); },
        allowOutsideClick: false
    });
    
    try {
        await fetch(APPS_SCRIPT_WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors', // Changed to no-cors for simple trigger
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(invoice)
        });
        
        // With no-cors, we can't read the response, so we optimistically assume success.
        Swal.fire('Sent!', 'The invoice email has been sent to the queue.', 'success');

    } catch (error) {
        console.error('Error sending email:', error);
        Swal.fire('Error!', `Could not send the email. Please check the browser console for details.`, 'error');
    }
}

function getLinkFor(num) {
    try {
        const base = location.origin + location.pathname.replace(/\/assets\/views\/admin\.html$/, "/index.html");
        return `${base}?id=${encodeURIComponent(num)}`;
    } catch {
        return `../../index.html?id=${encodeURIComponent(num)}`;
    }
}

// ================== INITIALIZATION ==================
async function main() {
    await initializeConfig();
    
    onSnapshot(invoicesCol, (snapshot) => {
        const allInvoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTable(allInvoices);
    }, (error) => {
        console.error("Error fetching invoices in realtime: ", error);
        const main = document.querySelector('main');
        main.innerHTML = `<div class="text-center p-8 text-red-500">Could not connect to the database.</div>`;
    });

    if (location.hash === '#new') {
        openModal();
    }
}

main();