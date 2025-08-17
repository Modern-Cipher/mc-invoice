// Dummy DB using localStorage (swap with Firebase later)
(function () {
  const KEY = "mc_invoices";

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
    catch { return []; }
  }
  function write(list) { localStorage.setItem(KEY, JSON.stringify(list)); }

  if (!read().length) write([]);

  window.DB = {
    all() { return read(); },
    save(list) { write(list); },
    upsert(inv) {
      const list = read();
      const i = list.findIndex(x => x.number === inv.number);
      if (i >= 0) list[i] = inv; else list.push(inv);
      write(list);
      return inv;
    },
    remove(number) { write(read().filter(x => x.number !== number)); },
    getByNumber(num){ return read().find(x => x.number === num); },
    linkFor(num){
      try {
        const base = location.origin + location.pathname.replace(/\/assets\/views\/admin\.html$/, "/index.html");
        return `${base}?id=${encodeURIComponent(num)}`;
      } catch {
        return `../../index.html?id=${encodeURIComponent(num)}`;
      }
    }
  };
})();
