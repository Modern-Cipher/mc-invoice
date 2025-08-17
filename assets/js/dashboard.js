import { db } from './firebase-init.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Helper para sa Pera
const php = n => new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(n||0));

// ================== INITIALIZE CHARTS ==================
// Gumawa ng basic chart options na gagana sa light at dark mode
const getChartThemeOptions = (theme) => ({
  chart: {
    background: 'transparent',
    toolbar: { show: false },
    foreColor: theme === 'dark' ? '#94a3b8' : '#64748b'
  },
  theme: { mode: theme },
  grid: {
    borderColor: theme === 'dark' ? '#334155' : '#e2e8f0',
    strokeDashArray: 3
  },
  tooltip: { theme: theme }
});

// Sales Chart (Area)
const salesChartOptions = {
  series: [{ name: 'Revenue', data: [] }],
  chart: { type: 'area', height: 300 },
  dataLabels: { enabled: false },
  stroke: { curve: 'smooth', width: 2 },
  xaxis: { type: 'datetime' },
  yaxis: { labels: { formatter: (val) => `₱${val/1000}k` } },
  tooltip: { x: { format: 'MMMM yyyy' } },
  markers: { size: 4 },
  fill: {
    type: "gradient",
    gradient: {
      shadeIntensity: 1,
      opacityFrom: 0.5,
      opacityTo: 0.1,
      stops: [0, 90, 100]
    }
  },
  ...getChartThemeOptions(localStorage.getItem('theme') || 'dark')
};
const salesChart = new ApexCharts(document.querySelector("#salesChart"), salesChartOptions);
salesChart.render();

// Services Chart (Horizontal Bar)
const servicesChartOptions = {
  series: [{ name: 'Quantity', data: [] }],
  chart: { type: 'bar', height: 300 },
  plotOptions: { bar: { borderRadius: 4, horizontal: true } },
  dataLabels: { enabled: true, offsetX: -1, style: { fontSize: '12px', colors: ['#fff'] } },
  xaxis: { categories: [] },
  ...getChartThemeOptions(localStorage.getItem('theme') || 'dark')
};
const servicesChart = new ApexCharts(document.querySelector("#servicesChart"), servicesChartOptions);
servicesChart.render();

// ================== DATA PROCESSING FUNCTIONS ==================

// Function para i-calculate ang mga KPI card
function updateKPIs(invoices) {
  const count = invoices.length;
  let gross = 0;
  let due = 0;

  invoices.forEach(inv => {
    let subtotal = 0, totalTax = 0, totalDisc = 0;
    (inv.items || []).forEach(it => {
      const base = (it.rate || 0) * (it.qty || 0);
      subtotal += base;
      totalTax += base * ((it.tax || 0) / 100);
      totalDisc += (it.discount || 0);
    });
    const total = subtotal + totalTax - totalDisc;
    gross += total;
    due += Math.max(0, total - (inv.downpayment || 0));
  });

  const avg = count > 0 ? gross / count : 0;

  document.getElementById('kpiCount').textContent = count;
  document.getElementById('kpiGross').textContent = php(gross);
  document.getElementById('kpiDue').textContent = php(due);
  document.getElementById('kpiAvg').textContent = php(avg);
}

// Function para i-process ang data para sa Sales Chart
function updateSalesChart(invoices) {
  const monthlySales = {};

  invoices.forEach(inv => {
    if (!inv.date) return;
    const month = inv.date.substring(0, 7); // e.g., "2025-08"
    let subtotal = 0, totalTax = 0, totalDisc = 0;
    (inv.items || []).forEach(it => {
        const base = (it.rate || 0) * (it.qty || 0);
        subtotal += base;
        totalTax += base * ((it.tax || 0) / 100);
        totalDisc += (it.discount || 0);
    });
    const total = subtotal + totalTax - totalDisc;

    if (!monthlySales[month]) {
      monthlySales[month] = 0;
    }
    monthlySales[month] += total;
  });

  const sortedMonths = Object.keys(monthlySales).sort();
  const seriesData = sortedMonths.map(month => ({
    x: new Date(`${month}-01T00:00:00`).getTime(),
    y: monthlySales[month]
  }));

  salesChart.updateSeries([{ data: seriesData }]);
}

// Function para i-process ang data para sa Services Chart
function updateServicesChart(invoices) {
  const serviceCounts = {};

  invoices.forEach(inv => {
    (inv.items || []).forEach(it => {
      const desc = it.desc.trim();
      if (desc) {
        if (!serviceCounts[desc]) {
          serviceCounts[desc] = 0;
        }
        serviceCounts[desc] += (it.qty || 0);
      }
    });
  });

  const sortedServices = Object.entries(serviceCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 7); // Kunin lang ang top 7

  const categories = sortedServices.map(item => item[0]);
  const seriesData = sortedServices.map(item => item[1]);

  servicesChart.updateOptions({
    xaxis: { categories: categories }
  });
  servicesChart.updateSeries([{ data: seriesData }]);
}


// ================== REAL-TIME LISTENER ==================
const invoicesCol = collection(db, "invoices");
onSnapshot(invoicesCol, (snapshot) => {
  const allInvoices = snapshot.docs.map(doc => doc.data());
  console.log(`Fetched ${allInvoices.length} invoices in real-time.`);

  // I-update lahat ng components sa dashboard
  updateKPIs(allInvoices);
  updateSalesChart(allInvoices);
  updateServicesChart(allInvoices);
  
}, (error) => {
  console.error("Error fetching invoices:", error);
  document.querySelector('main').innerHTML = `<div class="text-center text-red-500">Could not fetch data from Firebase.</div>`;
});


// ================== UTILITIES (THEME, SIDEBAR) ==================
// Theme toggle
const modeBtn = document.getElementById('modeBtn');
modeBtn?.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    const newTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme);
    // I-update ang theme ng charts kapag nag-switch
    salesChart.updateOptions(getChartThemeOptions(newTheme));
    servicesChart.updateOptions(getChartThemeOptions(newTheme));
});

// Sidebar toggle (mobile)
const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('sidebarBackdrop');
const toggler = document.getElementById('sidebarToggle');
toggler?.addEventListener('click', () => sidebar.classList.remove('-translate-x-full'));
backdrop?.addEventListener('click', () => sidebar.classList.add('-translate-x-full'));

// Initialize icons on load
lucide.createIcons();