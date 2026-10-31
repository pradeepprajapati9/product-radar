const $ = (id) => document.getElementById(id);
const rupee = (n) => (n === null || n === undefined ? '-' : '₹' + Math.round(n).toLocaleString('en-IN'));
const num = (n) => (n === null || n === undefined ? '-' : Number(n).toLocaleString('en-IN'));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const VERDICTS = { pick: 'Good', supplier: 'Need buy price', low: 'Low profit', brand: 'Hard to beat', cheap: 'Too cheap', none: 'No price' };

const VIEWS = {
    picks: {
        title: "Today's picks",
        caption: 'Products that pass every rule: good price, 4x margin, real profit, and not owned by a big brand.',
        info: (d) => d.total
            ? `${d.total} products pass. Open the top one, check the supplier, then buy 5-10 samples only.`
            : 'No product passes yet. Add buy prices on "Need buy price" so the radar can check more products.',
    },
    supplier: {
        title: 'Need buy price',
        caption: 'Price and competition look fine, but we do not know the wholesale price yet.',
        info: (d) => d.total
            ? `${d.total} products. Open one, search IndiaMART or Udaan, and type the buy price. It moves to picks if profit is good.`
            : 'Nothing here right now.',
    },
    rising: {
        title: 'Rising fast',
        caption: 'New in the bestseller list, or up 10+ places in the last 7 days. Festival and season items show up here.',
        info: (d) => (d.days < 2 ? 'Needs at least 2 days of data. Check back after the bot runs tomorrow.' : `${d.total} products rising.`),
    },
    watch: {
        title: 'Watchlist',
        caption: 'Products you saved. Rank, price and profit update every day.',
        info: (d) => (d.total ? '' : 'Empty. Open any product and click "Save to watchlist".'),
    },
    all: {
        title: 'All products',
        caption: 'Every bestseller the bot tracks. Click a row to see details and profit.',
        info: () => '',
    },
    calc: { title: 'Profit calculator', caption: 'Real profit per piece on Amazon after GST, fees, shipping, returns and ads.' },
    suppliers: {
        title: 'Suppliers',
        caption: 'Wholesale prices from IndiaMART. A product gets a buy price when its name has the keyword.',
    },
    data: { title: 'Data & settings', caption: 'When the bot ran, what it tracks, and the fee numbers used for profit.' },
};

let status = null;
let current = 'picks';

async function api(path, body) {
    const opts = body ? { method: 'POST', body: new URLSearchParams(body) } : {};
    const res = await fetch('api/' + path, opts);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
}

async function loadStatus() {
    status = await api('status.php');
    const run = status.last_run;
    $('syncDot').className = 'dot ' + (status.day === today() ? 'ok' : 'stale');
    $('lastSync').textContent = status.day ? `Data: ${status.day} · ${status.days} day(s)` : 'No data yet, run the bot';
    const cat = $('cat');
    cat.length = 1;
    status.categories.filter((c) => c.enabled == 1).forEach((c) => cat.add(new Option(c.name, c.id)));
    return run;
}

function today() {
    return new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
}

function show(view) {
    current = VIEWS[view] ? view : 'picks';
    document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === current));
    $('title').textContent = VIEWS[current].title;
    $('caption').textContent = VIEWS[current].caption;
    $('info').hidden = true;
    const isList = ['picks', 'supplier', 'rising', 'watch', 'all'].includes(current);
    $('listView').hidden = !isList;
    $('calcView').hidden = current !== 'calc';
    $('suppliersView').hidden = current !== 'suppliers';
    $('dataView').hidden = current !== 'data';
    if (isList) {
        $('sort').value = { picks: 'profit', rising: 'change' }[current] || 'rank';
        loadList();
    }
    if (current === 'suppliers') loadSuppliers();
    if (current === 'data') renderData();
}

function setInfo(text) {
    $('info').textContent = text;
    $('info').hidden = !text;
}

async function loadList() {
    const params = new URLSearchParams({ view: current, q: $('q').value, cat: $('cat').value, verdict: $('verdict').value, sort: $('sort').value });
    const data = await api('products.php?' + params);
    if (!data.day) {
        setInfo('No data yet. Double-click run_bot.bat in the project folder, wait about 8 minutes, then refresh.');
    } else {
        setInfo(VIEWS[current].info({ total: data.total, days: status.days }));
    }
    $('rows').innerHTML = data.rows.map(rowHtml).join('');
    $('empty').hidden = data.rows.length > 0;
    $('empty').textContent = 'No products match.';
}

function rowHtml(r) {
    let change = '';
    if (r.is_new) change = ' <span class="tag new">new</span>';
    else if (r.change > 0) change = ` <span class="up">▲${r.change}</span>`;
    else if (r.change < 0) change = ` <span class="down">▼${-r.change}</span>`;
    const profit = r.profit === null ? '-' : `<span class="${r.profit > 0 ? 'pos' : 'neg'}">${rupee(r.profit)}</span>`;
    return `<tr class="click" data-asin="${esc(r.asin)}">
        <td><div class="prod"><img src="${esc(r.image)}" alt="" loading="lazy"><div><span>${esc(r.name)}</span><small>${esc(r.category)}${r.watched ? ' · ★ saved' : ''}</small></div></div></td>
        <td class="num">#${r.rank}${change}</td>
        <td class="num">${rupee(r.price)}</td>
        <td class="num">${num(r.reviews)}</td>
        <td class="num">${rupee(r.buy)}</td>
        <td class="num">${profit}</td>
        <td><span class="tag ${r.verdict}" title="${esc(r.reason)}">${VERDICTS[r.verdict]}</span></td>
    </tr>`;
}

async function openProduct(asin) {
    const d = await api('product.php?asin=' + encodeURIComponent(asin));
    renderProduct(d);
    if (!$('drawer').open) $('drawer').showModal();
}

function renderProduct({ row, info, breakdown, history }) {
    $('dTitle').textContent = info.name;
    const asin = row ? row.asin : '';
    const search = encodeURIComponent(row?.keyword || info.name.split(' ').slice(0, 4).join(' '));
    let html = `<img class="drawer-img" src="${esc(info.image)}" alt="">`;
    if (row) {
        html += `<p><span class="tag ${row.verdict}">${VERDICTS[row.verdict]}</span> ${esc(row.reason)}</p>
        <div class="facts">
            <div><small>Amazon rank</small><b>#${row.rank}</b></div>
            <div><small>Sell price</small><b>${rupee(row.price)}</b></div>
            <div><small>Rating</small><b>${row.rating ?? '-'} ★</b></div>
            <div><small>Reviews</small><b>${num(row.reviews)}</b></div>
            <div><small>Buy price</small><b>${rupee(row.buy)}</b></div>
            <div><small>Profit / piece</small><b>${rupee(row.profit)}</b></div>
        </div>
        <p class="muted">${esc(info.category)}${row.buy_source ? ' · Buy price: ' + esc(row.buy_source) : ''}</p>`;
    }
    if (breakdown) {
        const total = breakdown.reduce((s, l) => s + l[1], 0);
        html += `<h2 class="gap-top">Profit breakdown</h2><table class="lines">${breakdown
            .map((l) => `<tr><td>${esc(l[0])}</td><td class="num">${rupee(l[1])}</td></tr>`)
            .join('')}<tr class="total"><td>Profit per piece</td><td class="num">${rupee(total)}</td></tr></table>`;
    }
    html += `<h2 class="gap-top">Rank history (lower is better)</h2>${spark(history)}`;
    html += `<div class="row-actions">
            <input type="number" id="buyInput" min="1" step="0.5" placeholder="Buy price ₹" value="${info.buy_price ?? ''}">
            <button class="btn" type="button" data-act="buy">Save buy price</button>
            <button class="btn ghost" type="button" data-act="watch">${row?.watched ? '★ Remove from watchlist' : '☆ Save to watchlist'}</button>
        </div>
        <div class="row-actions">
            <a href="https://www.amazon.in/dp/${esc(asin)}" target="_blank" rel="noopener">Open on Amazon</a>
            <a href="https://dir.indiamart.com/search.mp?ss=${search}" target="_blank" rel="noopener">Search IndiaMART</a>
            <a href="https://www.udaan.com/search?q=${search}" target="_blank" rel="noopener">Search Udaan</a>
            <a href="https://www.meesho.com/search?q=${search}" target="_blank" rel="noopener">Check Meesho</a>
        </div>
        <h2 class="gap-top">My note</h2>
        <textarea id="noteInput" placeholder="Supplier name, sample quality, MOQ...">${esc(info.note ?? '')}</textarea>
        <div class="row-actions"><button class="btn ghost" type="button" data-act="note">Save note</button></div>`;
    $('dBody').innerHTML = html;
    $('dBody').dataset.asin = asin;
}

function spark(history) {
    if (history.length < 2) return '<p class="muted">Needs 2+ days of data.</p>';
    const ranks = history.map((h) => h.rank);
    const max = Math.max(...ranks), min = Math.min(...ranks);
    const w = 500, h = 90, span = max - min || 1;
    const pts = history.map((p, i) => `${(i / (history.length - 1)) * w},${8 + ((p.rank - min) / span) * (h - 16)}`);
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="M${pts.join('L')}"/></svg>
        <p class="muted">${history[0].day}: #${ranks[0]} → ${history[history.length - 1].day}: #${ranks[ranks.length - 1]}</p>`;
}

async function productAction(act) {
    const asin = $('dBody').dataset.asin;
    const body = { asin, action: act };
    if (act === 'buy') body.price = $('buyInput').value;
    if (act === 'note') body.note = $('noteInput').value;
    renderProduct(await api('product.php', body));
    if (!$('listView').hidden) loadList();
}

async function loadSuppliers() {
    const { rows } = await api('suppliers.php');
    const ok = rows.filter((r) => r.status === 'ok').length;
    setInfo(`${ok} of ${rows.length} supplier pages have prices. The bot checks 15 pages per run (IndiaMART blocks fast requests).`);
    $('keywordRows').innerHTML = rows.map((r) => `<tr>
        <td>${esc(r.keyword)}</td>
        <td><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.slug)}</a></td>
        <td><span class="tag ${r.status}">${{ ok: 'Prices found', new: 'Not checked yet', missing: 'Page not found', blocked: 'Blocked, will retry' }[r.status]}</span>${r.n ? ` <small class="muted">${r.n} prices</small>` : ''}</td>
        <td class="num">${rupee(r.min_price)}</td>
        <td class="num">${rupee(r.median)}</td>
        <td class="num">${r.products}</td>
        <td><button class="link-btn" type="button" data-edit="${esc(r.keyword)}" data-slug="${esc(r.slug)}">Edit</button> · <button class="link-btn" type="button" data-del="${esc(r.keyword)}">Delete</button></td>
    </tr>`).join('');
}

function renderData() {
    const run = status.last_run;
    $('runInfo').innerHTML = run
        ? `Last run: <b>${esc(run.started_at)} UTC</b> · <span class="tag ${run.status === 'ok' ? 'ok' : run.status === 'running' ? 'new' : 'missing'}">${esc(run.status)}</span><br><span class="muted">${esc(run.message ?? 'Still running...')}</span>`
        : 'The bot has not run yet.';
    setInfo(`${num(status.products)} products tracked over ${status.days} day(s).`);
    $('catRows').innerHTML = status.categories.map((c) => `<tr>
        <td>${esc(c.name)}</td><td class="muted">${esc(c.parent)}</td><td class="num">${c.products}</td>
        <td>${c.last_status ? `<span class="tag ${c.last_status === 'ok' ? 'ok' : 'missing'}">${esc(c.last_status)}</span>` : '-'}</td>
        <td><input type="checkbox" data-cat="${c.id}" ${c.enabled == 1 ? 'checked' : ''}></td>
    </tr>`).join('');
    $('settingsGrid').innerHTML = status.settings.map((s) => `<label>${esc(s.label)}<input type="number" step="any" min="0" name="${s.key}" value="${s.value}"></label>`).join('');
}

document.addEventListener('click', (e) => {
    const row = e.target.closest('tr.click');
    if (row) openProduct(row.dataset.asin);
    const act = e.target.closest('[data-act]');
    if (act) productAction(act.dataset.act);
    if (e.target.dataset.edit) {
        const f = $('keywordForm');
        f.keyword.value = e.target.dataset.edit;
        f.slug.value = e.target.dataset.slug;
        f.slug.focus();
    }
    if (e.target.dataset.del && confirm('Delete keyword "' + e.target.dataset.del + '"?')) {
        api('suppliers.php', { action: 'delete', keyword: e.target.dataset.del }).then(loadSuppliers);
    }
});

document.addEventListener('change', async (e) => {
    if (e.target.dataset.cat) {
        await api('status.php', { action: 'category', id: e.target.dataset.cat });
        await loadStatus();
    }
});

$('dClose').addEventListener('click', () => $('drawer').close());
['cat', 'verdict', 'sort'].forEach((id) => $(id).addEventListener('change', loadList));
let typing;
$('q').addEventListener('input', () => {
    clearTimeout(typing);
    typing = setTimeout(loadList, 250);
});

$('calcForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const out = $('calcResult');
    try {
        const d = await api('calc.php?' + new URLSearchParams({ price: f.price.value, buy: f.buy.value }));
        out.innerHTML = `<p><span class="tag ${d.verdict}">${VERDICTS[d.verdict]}</span> ${esc(d.reason)}</p>
            <table class="lines">${d.lines.map((l) => `<tr><td>${esc(l[0])}</td><td class="num">${rupee(l[1])}</td></tr>`).join('')}
            <tr class="total"><td>Profit per piece (${d.margin}%)</td><td class="num">${rupee(d.profit)}</td></tr></table>`;
    } catch (err) {
        out.textContent = err.message;
    }
    out.hidden = false;
});

$('keywordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    await api('suppliers.php', { action: 'save', keyword: f.keyword.value, slug: f.slug.value });
    f.reset();
    loadSuppliers();
});

$('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('status.php', { action: 'settings', ...Object.fromEntries(new FormData(e.target)) });
    await loadStatus();
    setInfo('Saved. Profit is recalculated with the new numbers.');
});

// Opened as a file: PHP cannot run, so jump to the same page on XAMPP
if (location.protocol === 'file:' && location.pathname.includes('/htdocs/')) {
    location.replace('http://localhost/' + location.pathname.split('/htdocs/')[1].replace(/index\.html$/, '') + location.hash);
}

window.addEventListener('hashchange', () => show(location.hash.slice(1)));
loadStatus()
    .then(() => show(location.hash.slice(1) || 'picks'))
    .catch(() => {
        $('title').textContent = 'Cannot load data';
        $('lastSync').textContent = 'Not connected';
        setInfo('Start Apache in XAMPP, then open http://localhost/pr/product-radar/');
    });
