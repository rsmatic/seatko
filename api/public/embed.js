/*
 * Seatko embed: shows live ticket prices and availability for an event on any website.
 *
 *   <div data-seatko-event="1"
 *        data-buy-url="https://m.me/Poimenph"      (where buyers message you, e.g. your Messenger link)
 *        data-buy-label="Get tickets"></div>
 *
 * "Get tickets" opens a small window: the visitor picks tiers and quantities and reads your
 * "How to buy" instructions (Branding & settings). With online requests on, they fill in their
 * details and upload proof of payment for you to approve; otherwise they send a ready-made
 * message via the buy URL.
 * Add data-buy-mode="link" to make the button go straight to the buy URL instead.
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
    // "Get tickets" window
    '.seatko-dlg{border:1px solid var(--line,#2a2a2e);border-radius:var(--radius,12px);background:var(--bg-2,#141416);color:var(--text,#ececec);padding:0;width:min(30rem,calc(100vw - 2rem));max-height:calc(100vh - 2rem);font:inherit}',
    '.seatko-dlg::backdrop{background:rgba(0,0,0,.65)}',
    '.seatko-dlg form{position:relative;padding:1.25rem 1.25rem 1rem;display:flex;flex-direction:column;gap:.85rem;text-align:left}',
    '.seatko-dlg h3{margin:0 2rem 0 0;font-family:var(--display,inherit);font-size:1.4rem;letter-spacing:.03em;line-height:1.15}',
    '.seatko-x{position:absolute;top:.6rem;right:.8rem;background:none;border:0;color:inherit;font-size:1.5rem;cursor:pointer;line-height:1}',
    '.seatko-row{display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.5rem 0;border-bottom:1px solid var(--line,#2a2a2e)}',
    '.seatko-row small{display:block;color:var(--muted,#9a9aa2)}',
    '.seatko-step{display:flex;align-items:center;gap:.5rem}',
    '.seatko-step button{width:2rem;height:2rem;border-radius:50%;border:1px solid var(--line,#2a2a2e);background:transparent;color:inherit;font-size:1.1rem;cursor:pointer}',
    '.seatko-step button:disabled{opacity:.35;cursor:default}',
    '.seatko-step span{min-width:1.4rem;text-align:center;font-weight:600}',
    '.seatko-total{display:flex;justify-content:space-between;font-weight:700;font-size:1.05rem}',
    '.seatko-dlg label{font-size:.8rem;color:var(--muted,#9a9aa2);display:flex;flex-direction:column;gap:.3rem}',
    '.seatko-dlg input,.seatko-dlg textarea,.seatko-dlg select{font:inherit;font-size:.9rem;color:var(--text,#ececec);background:transparent;border:1px solid var(--line,#2a2a2e);border-radius:8px;padding:.55rem .7rem}',
    '.seatko-how{white-space:pre-wrap;background:rgba(255,255,255,.05);border-radius:8px;padding:.7rem .85rem;font-size:.9rem;line-height:1.5}',
    '.seatko-how strong{display:block;margin-bottom:.25rem}',
    '.seatko-payqr{display:block;margin:.6rem auto .25rem;width:min(15rem,100%);height:auto;border-radius:8px;background:#fff}',
    '.seatko-payqr-save{display:block;text-align:center;font-size:.8rem;color:var(--accent,#d9b56c)}',
    '.seatko-dlg .seatko-actions .btn{flex:1;text-align:center;cursor:pointer;font:inherit}',
    '.seatko-dlg .seatko-actions .btn:disabled{opacity:.45;cursor:default}',
    '.seatko-dlg select option{color:#111}',
    '.seatko-fixed{font-size:.95rem;font-weight:600;color:var(--text,#ececec);padding:.55rem .7rem;border:1px solid var(--line,#2a2a2e);border-radius:8px;background:rgba(255,255,255,.04)}',
    '.seatko-note{font-size:.8rem;color:var(--muted,#9a9aa2);text-align:center;margin:0}',
    // Host sites may only style <a class="btn">; keep the secondary <button> transparent like theirs.
    '.seatko-dlg .btn:not(.primary){background:transparent;color:inherit;border:1px solid var(--line,#2a2a2e)}',
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

  function when(ev, withDoors) {
    var d = new Date(ev.starts_at);
    var s = d.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
    if (ev.doors_at && withDoors !== false) s += ' (doors ' + new Date(ev.doors_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) + ')';
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
      else if (buyUrl || ev.requests_enabled) {
        var a = el('a', 'btn primary', root.getAttribute('data-buy-label') || 'Get tickets');
        a.href = buyUrl || '#';
        a.target = '_blank';
        a.rel = 'noopener';
        var onSale = ev.tiers.some(function (t) { return t.remaining > 0; });
        if (root.getAttribute('data-buy-mode') !== 'link' && onSale && window.HTMLDialogElement) {
          a.addEventListener('click', function (e) { e.preventDefault(); openBuyDialog(ev, buyUrl); });
        }
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

  function copyText(text) {
    function fallback() {
      var t = document.createElement('textarea');
      t.value = text;
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.appendChild(t);
      t.select();
      try { document.execCommand('copy'); } catch (e) { /* nothing more to try */ }
      t.remove();
    }
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(fallback);
    fallback();
    return Promise.resolve();
  }

  function hostOf(url) {
    try { return new URL(url).hostname; } catch (e) { return ''; }
  }

  function howToBuy(form, ev) {
    if (!ev.buy_instructions && !ev.payment_qr_url) return;
    var how = el('div', 'seatko-how');
    how.appendChild(el('strong', null, 'How to pay'));
    if (ev.buy_instructions) how.appendChild(document.createTextNode(ev.buy_instructions));
    if (ev.payment_qr_url) {
      // The organizer's payment QR (e.g. GCash). On a phone, buyers save it and upload it in their wallet app.
      var src = base + ev.payment_qr_url;
      var img = el('img', 'seatko-payqr');
      img.src = src;
      img.alt = 'Payment QR code';
      how.appendChild(img);
      var save = el('a', 'seatko-payqr-save', 'Open QR code (tap and hold to save)');
      save.href = src;
      save.target = '_blank';
      save.rel = 'noopener';
      how.appendChild(save);
    }
    form.appendChild(how);
  }

  function field(form, label, input) {
    var l = el('label', null, label);
    l.appendChild(input);
    form.appendChild(l);
    return input;
  }

  /** Message mode: build a message to send via Messenger (or copy). Returns the update callback. */
  function messageForm(form, ev, buyUrl) {
    var name = el('input');
    name.autocomplete = 'name';
    field(form, 'Your name (optional)', name);
    howToBuy(form, ev);
    var msg = el('textarea');
    msg.rows = 6;
    field(form, 'Your message', msg);

    var isMessenger = /(^|\.)(m\.me|messenger\.com)$/i.test(hostOf(buyUrl));
    var actions = el('div', 'seatko-actions');
    var send = el('button', 'btn primary', isMessenger ? 'Send via Messenger' : 'Continue');
    var copy = el('button', 'btn', 'Copy message');
    send.type = copy.type = 'button';
    actions.appendChild(send);
    actions.appendChild(copy);
    form.appendChild(actions);
    var note = el('p', 'seatko-note', '');
    form.appendChild(note);

    var edited = false;
    var last = { lines: [], sum: 0 };
    msg.addEventListener('input', function () { edited = true; });
    name.addEventListener('input', function () { render(); });

    function render() {
      send.disabled = !last.lines.length || !buyUrl;
      if (edited) return;
      msg.value = ['Hi ' + (ev.org_name || 'there') + '! I would like to buy tickets for ' + ev.title + ' on ' + when(ev, false) + ':']
        .concat(last.lines.length ? last.lines : ['- (choose your tickets above)'])
        .concat(last.lines.length ? ['Total: ' + money(last.sum, ev.currency)] : [])
        .concat(name.value.trim() ? ['Name: ' + name.value.trim()] : [])
        .concat(['', 'How can I pay?'])
        .join('\n');
    }

    send.addEventListener('click', function () {
      var text = msg.value;
      copyText(text);
      var url = buyUrl;
      // Messenger may pre-fill the text; if it doesn't, the message is already on the clipboard.
      if (isMessenger) url += (url.indexOf('?') < 0 ? '?' : '&') + 'text=' + encodeURIComponent(text);
      window.open(url, '_blank', 'noopener');
      note.textContent = 'Your message was copied. If Messenger opens empty, just paste it and send.';
    });
    copy.addEventListener('click', function () {
      copyText(msg.value).then(function () { note.textContent = 'Message copied.'; });
    });

    return function (lines, sum) { last = { lines: lines, sum: sum }; render(); };
  }

  /** Request mode: buyer details + proof of payment, sent to SeatKo for the organizer to approve. */
  function requestForm(form, ev, buyUrl) {
    howToBuy(form, ev);
    var name = field(form, 'Full name *', el('input'));
    name.autocomplete = 'name';
    var email = field(form, 'Email * (your tickets will be sent here)', el('input'));
    email.type = 'email';
    email.autocomplete = 'email';
    var phone = field(form, 'Mobile number *', el('input'));
    phone.type = 'tel';
    phone.autocomplete = 'tel';
    var LABELS = { gcash: 'GCash', maya: 'Maya', bank_transfer: 'Bank transfer', other: 'Other' };
    var methods = (ev.payment_methods && ev.payment_methods.length ? ev.payment_methods : ['gcash', 'maya', 'bank_transfer', 'other']);
    var method;
    if (methods.length === 1) {
      // Only one accepted method: show it as fixed text instead of a choice.
      method = { value: methods[0] };
      var fixed = el('div', 'seatko-fixed', LABELS[methods[0]] || methods[0]);
      field(form, 'Paid via', fixed);
    } else {
      method = el('select');
      methods.forEach(function (m) {
        var o = el('option', null, LABELS[m] || m);
        o.value = m;
        method.appendChild(o);
      });
      field(form, 'Paid via *', method);
    }
    var ref = field(form, 'Reference number', el('input'));
    var proof = el('input');
    proof.type = 'file';
    proof.accept = 'image/png,image/jpeg,image/webp';
    field(form, 'Screenshot of your payment *', proof);
    var note = field(form, 'Note (optional)', el('input'));
    // Honeypot: hidden from people, often filled in by spam bots.
    var trap = el('input');
    trap.name = 'website';
    trap.tabIndex = -1;
    trap.autocomplete = 'off';
    trap.setAttribute('aria-hidden', 'true');
    trap.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0';
    form.appendChild(trap);

    var actions = el('div', 'seatko-actions');
    var submit = el('button', 'btn primary', 'Submit request');
    submit.type = 'button';
    actions.appendChild(submit);
    form.appendChild(actions);
    var status = el('p', 'seatko-note', 'No seat is reserved until your payment is confirmed. Your tickets will be emailed to you.');
    form.appendChild(status);
    if (buyUrl) {
      var ask = el('a', 'seatko-note', 'Questions? Message us');
      ask.href = buyUrl;
      ask.target = '_blank';
      ask.rel = 'noopener';
      ask.style.display = 'block';
      ask.style.color = 'var(--accent,#d9b56c)';
      form.appendChild(ask);
    }

    var items = [];
    var hint = status.textContent;
    function fail(msg) {
      status.textContent = msg;
      status.style.color = '#ff8a80';
    }
    // Clear an error as soon as the visitor starts fixing it.
    form.addEventListener('input', function () {
      if (submit.disabled && submit.textContent !== 'Submit request') return;
      status.textContent = hint;
      status.style.color = '';
    });

    submit.addEventListener('click', function () {
      if (!items.length) return fail('Choose your tickets above.');
      if (!name.value.trim()) return fail('Please enter your full name.');
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email.value.trim())) return fail('Please enter a valid email address.');
      if (!phone.value.trim()) return fail('Please enter your mobile number.');
      if (!proof.files[0]) return fail('Please attach a screenshot of your payment.');
      if (proof.files[0].size > 5 * 1024 * 1024) return fail('The screenshot is too large (max 5 MB).');

      var fd = new FormData();
      fd.append('buyer_name', name.value.trim());
      fd.append('buyer_email', email.value.trim());
      fd.append('buyer_phone', phone.value.trim());
      fd.append('payment_method', method.value);
      fd.append('payment_ref', ref.value.trim());
      fd.append('note', note.value.trim());
      fd.append('website', trap.value);
      fd.append('items', JSON.stringify(items));
      fd.append('proof', proof.files[0]);

      submit.disabled = true;
      submit.textContent = 'Sending…';
      status.style.color = '';
      status.textContent = 'Uploading your request…';
      fetch(base + '/api/public/events/' + encodeURIComponent(ev.id) + '/requests', { method: 'POST', body: fd })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.d.error || 'Something went wrong. Please try again.');
          // Replace the form with a confirmation, keeping the close button.
          var keep = form.firstChild;
          form.innerHTML = '';
          form.appendChild(keep);
          form.appendChild(el('h3', null, 'Request received!'));
          form.appendChild(el('p', null, 'Thank you, ' + name.value.trim() + '. We will check your payment of ' +
            money(res.d.amount_cents, ev.currency) + ' and email your tickets to ' + res.d.email + '.'));
          var refLine = el('p', 'seatko-note', 'Your reference: ' + res.d.reference);
          refLine.style.fontWeight = '600';
          form.appendChild(refLine);
          form.appendChild(el('p', 'seatko-note', 'A confirmation email is on its way. Check your spam folder if you don\'t see it.'));
        })
        .catch(function (e) {
          submit.disabled = false;
          submit.textContent = 'Submit request';
          fail(e.message || 'Could not send. Please check your connection and try again.');
        });
    });

    return function (lines, sum, its) {
      items = its;
      submit.disabled = !its.length;
    };
  }

  /** "Get tickets" window: pick tiers, read how to pay, send a ready-made message. */
  function openBuyDialog(ev, buyUrl) {
    var qty = {};
    var dlg = el('dialog', 'seatko-dlg');
    dlg.setAttribute('aria-label', 'Get tickets');
    var form = el('form');
    form.method = 'dialog';
    form.addEventListener('submit', function (e) { e.preventDefault(); }); // Enter in a field must not close the window
    var close = el('button', 'seatko-x', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', function () { dlg.close(); });
    form.appendChild(close);
    form.appendChild(el('h3', null, ev.title));
    form.appendChild(el('div', 'seatko-note', when(ev)));

    var list = el('div');
    var total = el('div', 'seatko-total');
    var totalAmount = el('span');
    total.appendChild(el('span', null, 'Total'));
    total.appendChild(totalAmount);

    ev.tiers.forEach(function (t, i) {
      if (!t.remaining) return;
      var max = Math.min(t.remaining, 10);
      var row = el('div', 'seatko-row');
      var info = el('div');
      info.appendChild(el('strong', null, t.name));
      info.appendChild(el('small', null, money(t.price_cents, ev.currency) + (t.remaining <= 20 ? ' · only ' + t.remaining + ' left' : '')));
      var step = el('div', 'seatko-step');
      var minus = el('button', null, '−');
      var count = el('span', null, '0');
      var plus = el('button', null, '+');
      minus.type = plus.type = 'button';
      minus.setAttribute('aria-label', 'Fewer ' + t.name);
      plus.setAttribute('aria-label', 'More ' + t.name);
      count.setAttribute('aria-live', 'polite');
      function set(n) {
        qty[i] = Math.max(0, Math.min(max, n));
        count.textContent = String(qty[i]);
        minus.disabled = qty[i] === 0;
        plus.disabled = qty[i] === max;
        update();
      }
      minus.addEventListener('click', function () { set((qty[i] || 0) - 1); });
      plus.addEventListener('click', function () { set((qty[i] || 0) + 1); });
      step.appendChild(minus);
      step.appendChild(count);
      step.appendChild(plus);
      row.appendChild(info);
      row.appendChild(step);
      list.appendChild(row);
      qty[i] = 0;
      minus.disabled = true;
    });
    form.appendChild(list);
    form.appendChild(total);

    // Two modes: a request form with proof of payment (when the organizer accepts online
    // requests), or a ready-made message to send via the buy URL (e.g. Messenger).
    var onChange = ev.requests_enabled ? requestForm(form, ev, buyUrl) : messageForm(form, ev, buyUrl);

    function update() {
      var lines = [];
      var items = [];
      var sum = 0;
      ev.tiers.forEach(function (t, i) {
        if (!qty[i]) return;
        sum += qty[i] * t.price_cents;
        lines.push('- ' + qty[i] + ' × ' + t.name + ' (' + money(t.price_cents, ev.currency) + ' each)');
        items.push({ tier_id: t.id, qty: qty[i] });
      });
      totalAmount.textContent = money(sum, ev.currency);
      onChange(lines, sum, items);
    }

    update();
    dlg.appendChild(form);
    dlg.addEventListener('close', function () { dlg.remove(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    document.body.appendChild(dlg);
    dlg.showModal();
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
