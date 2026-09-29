/*
 * Seatko embed: shows live ticket prices and availability for an event on any website.
 *
 *   <div data-seatko-event="1"
 *        data-buy-url="https://m.me/Poimenph"      (where the "Get tickets" button goes)
 *        data-buy-label="Get tickets"></div>
 *   <script src="https://YOUR-SEATKO-HOST/embed.js" defer></script>
 *
 * Styling inherits the host page's --accent, --text, --muted, --line, --bg-2, --radius, --display
 * CSS variables when present, and its .btn / .btn.primary classes.
 */
(function () {
  var script = document.currentScript;
  var base = script ? new URL(script.src).origin : '';

  var css = [
    '.seatko{max-width:44rem;margin:0 auto 1.5rem;text-align:center;font:inherit;color:var(--text,#ececec)}',
    '.seatko-meta{color:var(--muted,#9a9aa2);margin:0 0 1.1rem}',
    '.seatko-meta strong{color:var(--text,#ececec);font-weight:600}',
    '.seatko-tiers{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.75rem;margin:0 0 1.25rem;padding:0;list-style:none}',
    '.seatko-tier{background:var(--bg-2,#141416);border:1px solid var(--line,#2a2a2e);border-top:3px solid var(--tier,#d9b56c);border-radius:var(--radius,12px);padding:.9rem .8rem}',
    '.seatko-name{font-family:var(--display,inherit);font-size:1.25rem;letter-spacing:.04em;line-height:1.1}',
    '.seatko-price{font-size:1.15rem;font-weight:600;color:var(--accent,#d9b56c);margin:.25rem 0}',
    '.seatko-left{font-size:.8rem;color:var(--muted,#9a9aa2)}',
    '.seatko-out .seatko-price{text-decoration:line-through;opacity:.5}',
    '.seatko-actions{display:flex;flex-wrap:wrap;gap:.75rem;justify-content:center}',
    '.seatko-find{display:flex;gap:.5rem;justify-content:center;margin-top:1rem;flex-wrap:wrap}',
    '.seatko-find input{font:inherit;padding:.55rem .8rem;border-radius:var(--pill,999px);border:1px solid var(--line,#2a2a2e);background:transparent;color:inherit;width:14rem;text-transform:uppercase}',
    '.seatko-find button{background:transparent;color:inherit;cursor:pointer;font:inherit}',
    '.seatko-status{color:var(--accent,#d9b56c);font-weight:600}',
  ].join('');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function money(cents, currency) {
    try {
      return new Intl.NumberFormat('en-PH', { style: 'currency', currency: currency || 'PHP', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
    } catch (e) {
      return (currency || '') + ' ' + (cents / 100).toFixed(2);
    }
  }

  function when(ev) {
    var d = new Date(ev.starts_at);
    var s = d.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
    if (ev.doors_at) s += ' (doors ' + new Date(ev.doors_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) + ')';
    return s;
  }

  function render(root, ev) {
    var appUrl = root.getAttribute('data-app-url') || base;
    var buyUrl = root.getAttribute('data-buy-url');
    var box = el('div', 'seatko');

    var meta = el('p', 'seatko-meta');
    meta.appendChild(el('strong', null, ev.venue || 'Venue to be announced'));
    if (ev.address) meta.appendChild(document.createTextNode(' · ' + ev.address));
    meta.appendChild(el('br'));
    meta.appendChild(document.createTextNode(when(ev)));
    box.appendChild(meta);

    if (ev.status === 'cancelled') {
      box.appendChild(el('p', 'seatko-status', 'This event has been cancelled.'));
    } else {
      var list = el('ul', 'seatko-tiers');
      ev.tiers.forEach(function (t) {
        var li = el('li', 'seatko-tier' + (t.remaining ? '' : ' seatko-out'));
        li.style.setProperty('--tier', t.color);
        li.appendChild(el('div', 'seatko-name', t.name));
        li.appendChild(el('div', 'seatko-price', money(t.price_cents, ev.currency)));
        li.appendChild(el('div', 'seatko-left', !t.remaining ? 'Sold out' : t.remaining <= 20 ? 'Only ' + t.remaining + ' left' : t.description || 'Available'));
        list.appendChild(li);
      });
      if (ev.tiers.length) box.appendChild(list);

      var actions = el('div', 'seatko-actions');
      if (ev.status === 'sold_out') actions.appendChild(el('p', 'seatko-status', 'Sold out. Thank you!'));
      else if (ev.status === 'closed') actions.appendChild(el('p', 'seatko-status', 'Ticket sales are closed.'));
      else if (buyUrl) {
        var a = el('a', 'btn primary', root.getAttribute('data-buy-label') || 'Get tickets');
        a.href = buyUrl;
        a.target = '_blank';
        a.rel = 'noopener';
        actions.appendChild(a);
      }
      box.appendChild(actions);
    }

    // Buyers who already have a ticket code can reopen their ticket (QR) here.
    var find = el('form', 'seatko-find');
    var input = el('input');
    input.placeholder = 'Ticket code';
    input.setAttribute('aria-label', 'Ticket code');
    var go = el('button', 'btn', 'View my ticket');
    find.appendChild(input);
    find.appendChild(go);
    find.addEventListener('submit', function (e) {
      e.preventDefault();
      var code = input.value.trim().toUpperCase();
      if (code) window.open(appUrl + '/t/' + encodeURIComponent(code), '_blank', 'noopener');
    });
    box.appendChild(find);

    root.replaceChildren(box);
  }

  function load(root) {
    var id = root.getAttribute('data-seatko-event');
    fetch(base + '/api/public/events/' + encodeURIComponent(id))
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (ev) { render(root, ev); })
      .catch(function () { /* leave the fallback content in place */ });
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-seatko-event]'), load);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
