const $ = (id) => document.getElementById(id);
const rupee = (n) => (n === null || n === undefined ? '-' : (n < 0 ? '-₹' : '₹') + Math.abs(Math.round(n)).toLocaleString('en-IN'));
const num = (n) => (n === null || n === undefined ? '-' : Number(n).toLocaleString('en-IN'));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const VERDICTS = { pick: 'Good', supplier: 'Need buy price', low: 'Low profit', brand: 'Hard to beat', cheap: 'Too cheap', none: 'No price' };
const LIST_VIEWS = ['picks', 'supplier', 'rising', 'watch', 'all'];

const VIEWS = {
    home: { title: 'Dashboard', caption: 'What the radar found today, and what to do next.' },
    plan: { title: 'Launch plan', caption: 'Every step from finding a product to your first sale. Tick each step when done.' },
    picks: {
        title: "Today's picks",
        caption: 'Pass every rule: ₹450+ price, 4x margin, 20%+ profit, and no big brand to fight.',
        info: (d) => d.total
            ? `${d.total} products pass. Open the top one, check suppliers, then buy 2-5 samples only.`
            : 'No product passes yet. Add buy prices on "Need buy price" so the radar can check more.',
    },
    supplier: {
        title: 'Need buy price',
        caption: 'Price and competition look fine, but the wholesale price is unknown.',
        info: (d) => (d.total ? `${d.total} products. Open one, search IndiaMART or Udaan, and save the buy price. Good ones move to picks.` : 'Nothing here right now.'),
    },
    rising: {
        title: 'Rising fast',
        caption: 'New in the bestseller list, or up 10+ places in 7 days. Festival and season items show here.',
        info: (d) => (d.days < 2 ? 'Needs 2 days of data. Check back after tomorrow\'s bot run.' : `${d.total} products rising.`),
    },
    watch: {
        title: 'Watchlist',
        caption: 'Products you saved. Rank, price and profit update every day.',
        info: (d) => (d.total ? '' : 'Empty. Open any product and click "Save to watchlist".'),
    },
    all: { title: 'All products', caption: 'Every bestseller the bot tracks. Click any product for details.', info: () => '' },
    calc: { title: 'Profit calculator', caption: 'Real profit per piece after GST, Amazon fees, shipping, returns and ads.' },
    suppliers: { title: 'Suppliers', caption: 'IndiaMART wholesale prices. A product gets a buy price when its name has the keyword.' },
    data: { title: 'Data & settings', caption: 'When the bot ran, what it tracks, and the fee numbers used for profit.' },
};

let status = null;
let current = 'home';
let layout = store('layout') || 'table';

function store(key, value) {
    try {
        if (value === undefined) return localStorage.getItem('pr-' + key);
        localStorage.setItem('pr-' + key, value);
    } catch (e) {
        return null;
    }
}

async function api(path, body) {
    const opts = body ? { method: 'POST', body: new URLSearchParams(body) } : {};
    const res = await fetch('api/' + path, opts);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
}

function today() {
    return new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
}

async function loadStatus() {
    status = await api('status.php');
    $('syncDot').className = 'dot ' + (status.day === today() ? 'ok' : 'stale');
    $('lastSync').textContent = status.day ? `Data ${status.day} · ${status.days} day(s)` : 'No data yet';
    const cat = $('cat');
    cat.length = 1;
    status.categories.filter((c) => c.enabled == 1).forEach((c) => cat.add(new Option(c.name, c.id)));
}

function setInfo(text) {
    $('info').textContent = text;
    $('info').hidden = !text;
}

function show(view) {
    current = VIEWS[view] ? view : 'home';
    document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === current));
    $('title').textContent = VIEWS[current].title;
    $('caption').textContent = VIEWS[current].caption;
    setInfo('');
    const isList = LIST_VIEWS.includes(current);
    $('homeView').hidden = current !== 'home';
    $('planView').hidden = current !== 'plan';
    $('listView').hidden = !isList;
    $('calcView').hidden = current !== 'calc';
    $('suppliersView').hidden = current !== 'suppliers';
    $('dataView').hidden = current !== 'data';
    if (current === 'home') loadHome();
    if (current === 'plan') loadPlan();
    if (isList) {
        $('sort').value = { picks: 'profit', rising: 'change' }[current] || 'rank';
        loadList();
    }
    if (current === 'suppliers') loadSuppliers();
    if (current === 'data') renderData();
    window.scrollTo(0, 0);
}

// Dashboard

async function loadHome() {
    const d = await api('overview.php');
    setBadges(d);
    if (!d.day) {
        setInfo('No data yet. Run: python bot/radar_bot.py in the project folder, wait about 8 minutes, then refresh.');
        return;
    }
    const k = d.kpi;
    const step = d.plan.next ? `Next step in your plan: ${d.plan.next}.` : 'Launch plan complete.';
    setInfo(k.picks ? `${k.picks} products can make money today. ${step}` : `No picks yet. Add buy prices to find some. ${step}`);
    $('kpis').innerHTML = [
        ['hero', '#picks', 'Good picks', k.picks, 'pass every rule'],
        ['', '#picks', 'Best profit / piece', rupee(k.best), 'top pick, after all costs'],
        ['', '#supplier', 'Need buy price', k.supplier, 'could become picks'],
        ['', '#rising', 'Rising fast', d.days < 2 ? '-' : k.rising, d.days < 2 ? 'from tomorrow' : 'new or +10 places'],
        ['', '#all', 'Products tracked', num(k.products), `${d.days} day(s) of data`],
    ].map(([cls, href, label, value, sub]) => `<a class="kpi ${cls}" href="${href}"><small>${label}</small><b>${value}</b><span>${sub}</span></a>`).join('');
    $('topCards').innerHTML = d.top.length ? d.top.map(cardHtml).join('') : '<p class="empty">No picks yet.</p>';
    renderVerdicts(d.verdicts);
    renderBands(d.bands);
    renderCategories(d.categories);
}

function setBadges(d) {
    $('pickBadge').textContent = d.kpi.picks || '';
    $('planBadge').textContent = `${d.plan.complete}/${d.plan.total}`;
}

function renderVerdicts(v) {
    const order = ['pick', 'supplier', 'low', 'brand', 'cheap', 'none'];
    const total = order.reduce((s, k) => s + (v[k] || 0), 0) || 1;
    const shown = order.filter((k) => v[k]);
    $('verdictChart').innerHTML = `<div class="stack">${shown
        .map((k) => `<span class="v-${k}" style="flex:${v[k]}" data-tip="${VERDICTS[k]}: ${num(v[k])} (${Math.round((v[k] / total) * 100)}%)"></span>`)
        .join('')}</div><ul class="legend">${shown
        .map((k) => `<li><i class="v-${k}"></i>${VERDICTS[k]}<b>${num(v[k])}</b><small>${Math.round((v[k] / total) * 100)}%</small></li>`)
        .join('')}</ul>`;
}

function renderBands(bands) {
    const max = Math.max(...bands.map((b) => b.n), 1);
    $('bandChart').innerHTML = `<div class="cols">${bands
        .map((b, i) => `<div class="col" data-tip="${esc(b.label)}: ${num(b.n)} products"><b>${num(b.n)}</b><span class="${i >= 2 ? 'ok' : ''}" style="height:${(b.n / max) * 100}%"></span></div>`)
        .join('')}</div><div class="col-labels">${bands.map((b) => `<small>${esc(b.label)}</small>`).join('')}</div>`;
}

function renderCategories(cats) {
    const max = Math.max(...cats.map((c) => c.picks + c.supplier), 1);
    $('catChart').innerHTML = `<ul class="legend"><li><i class="v-pick"></i>Good picks</li><li><i class="v-supplier"></i>Need buy price</li></ul>
        <div class="hbars gap-top">${cats
        .map((c) => `<div class="hbar" data-tip="${esc(c.name)}: ${c.picks} good, ${c.supplier} need buy price, ${c.products} tracked">
            <span class="hbar-label">${esc(c.name)}</span>
            <span class="hbar-track">${c.picks ? `<span class="v-pick" style="width:${(c.picks / max) * 100}%"></span>` : ''}${c.supplier ? `<span class="v-supplier" style="width:${(c.supplier / max) * 100}%"></span>` : ''}</span>
            <span class="hbar-val">${c.picks} good · ${c.supplier} need price</span></div>`)
        .join('')}</div>`;
}

// Launch plan

async function loadPlan() {
    renderPlan(await api('plan.php'));
}

function renderPlan(p) {
    $('planBadge').textContent = `${p.complete}/${p.total}`;
    $('planCount').textContent = `${p.complete} of ${p.total} steps done`;
    $('planBar').style.width = `${(p.complete / p.total) * 100}%`;
    $('planNext').textContent = p.next ? `Next: ${p.next}` : 'All steps done. Keep repeating "Decide and grow".';
    $('phases').innerHTML = p.phases.map((ph, i) => `<div class="card phase ${ph.done === ph.steps.length ? 'complete' : ''}">
        <div class="phase-head">
            <span class="phase-num">${ph.done === ph.steps.length ? '✓' : i + 1}</span>
            <h3>${esc(ph.title)}<small>${ph.done} of ${ph.steps.length} done</small></h3>
            <div class="phase-meta"><b>${esc(ph.when)}</b>${esc(ph.cost)}</div>
        </div>
        ${ph.steps.map((s) => `<label class="step ${s.done ? 'done' : ''} ${s.auto ? 'auto' : ''}">
            <input type="checkbox" data-step="${esc(s.key)}" ${s.done ? 'checked' : ''} ${s.auto ? 'disabled' : ''}>
            <span><b>${esc(s.title)}</b>${s.auto ? '<em>auto</em>' : ''}<p>${esc(s.detail)}</p></span>
        </label>`).join('')}
    </div>`).join('');
}

// Product lists

async function loadList() {
    const params = new URLSearchParams({ view: current, q: $('q').value, cat: $('cat').value, verdict: $('verdict').value, sort: $('sort').value });
    const data = await api('products.php?' + params);
    setInfo(data.day ? VIEWS[current].info({ total: data.total, days: status.days }) : 'No data yet. Run: python bot/radar_bot.py, wait about 8 minutes, then refresh.');
    document.querySelectorAll('[data-layout]').forEach((b) => b.classList.toggle('on', b.dataset.layout === layout));
    $('tableWrap').hidden = layout !== 'table';
    $('listCards').hidden = layout !== 'cards';
    if (layout === 'table') $('rows').innerHTML = data.rows.map(rowHtml).join('');
    else $('listCards').innerHTML = data.rows.map(cardHtml).join('');
    $('empty').hidden = data.rows.length > 0;
    $('empty').textContent = 'No products match.';
}

function changeHtml(r) {
    if (r.is_new) return ' <span class="tag new">new</span>';
    if (r.change > 0) return ` <span class="up">▲${r.change}</span>`;
    if (r.change < 0) return ` <span class="down">▼${-r.change}</span>`;
    return '';
}

function rowHtml(r) {
    const profit = r.profit === null ? '-' : `<span class="${r.profit > 0 ? 'pos' : 'neg'}">${rupee(r.profit)}</span>`;
    return `<tr class="click" data-asin="${esc(r.asin)}">
        <td><div class="prod"><img src="${esc(r.image)}" alt="" loading="lazy"><div><span>${esc(r.name)}</span><small>${esc(r.category)}${r.watched ? ' · ★ saved' : ''}</small></div></div></td>
        <td class="num">#${r.rank}${changeHtml(r)}</td>
        <td class="num">${rupee(r.price)}</td>
        <td class="num">${num(r.reviews)}</td>
        <td class="num">${rupee(r.buy)}</td>
        <td class="num">${profit}</td>
        <td><span class="tag ${r.verdict}" data-tip="${esc(r.reason)}">${VERDICTS[r.verdict]}</span></td>
    </tr>`;
}

function cardHtml(r) {
    const margin = Math.max(0, Math.min(100, (r.margin ?? 0) * 2));
    return `<div class="pcard" data-asin="${esc(r.asin)}">
        <div class="pcard-img"><img src="${esc(r.image)}" alt="" loading="lazy"></div>
        <span class="rank">#${r.rank}</span>${r.watched ? '<span class="star">★</span>' : ''}
        <div class="pcard-body">
            <div><div class="pcard-name">${esc(r.name)}</div><div class="pcard-cat">${esc(r.category)}${changeHtml(r)}</div></div>
            <div class="pcard-nums">
                <span>Sell<b>${rupee(r.price)}</b></span>
                <span>Buy<b>${rupee(r.buy)}</b></span>
                <span>Reviews<b>${num(r.reviews)}</b></span>
            </div>
            <div class="pcard-profit">
                <span class="tag ${r.verdict}">${VERDICTS[r.verdict]}</span>
                <b class="${(r.profit ?? 0) < 0 ? 'neg' : ''}">${r.profit === null ? '-' : rupee(r.profit)}</b>
            </div>
            ${r.margin !== null ? `<div class="meter" data-tip="Margin ${r.margin}%"><span style="width:${margin}%"></span></div>` : ''}
        </div>
    </div>`;
}

// Product drawer

async function openProduct(asin) {
    renderProduct(await api('product.php?asin=' + encodeURIComponent(asin)));
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
            <div><small>Amazon rank</small><b>#${row.rank}</b>${changeHtml(row)}</div>
            <div><small>Sell price</small><b>${rupee(row.price)}</b></div>
            <div><small>Rating</small><b>${row.rating ?? '-'} ★</b></div>
            <div><small>Reviews</small><b>${num(row.reviews)}</b></div>
            <div><small>Buy price</small><b>${rupee(row.buy)}</b></div>
            <div class="${row.profit > 0 ? 'hl' : ''}"><small>Profit / piece</small><b>${rupee(row.profit)}</b></div>
        </div>
        <p class="muted">${esc(info.category)}${row.buy_source ? ' · Buy price: ' + esc(row.buy_source) : ''}</p>`;
    }
    if (breakdown) html += `<h2 class="gap-top">Where the money goes</h2>${waterfall(breakdown)}`;
    html += `<h2 class="gap-top">Amazon rank (higher line = better)</h2>${lineChart(history.map((h) => [h.day, h.rank]), { invert: true, fmt: (v) => '#' + v })}`;
    html += `<h2 class="gap-top">Sell price</h2>${lineChart(history.filter((h) => h.price).map((h) => [h.day, +h.price]), { fmt: rupee })}`;
    html += `<h2 class="gap-top">Your buy price</h2>
        <div class="row-actions">
            <input type="number" id="buyInput" min="1" step="0.5" placeholder="₹ per piece" value="${info.buy_price ?? ''}">
            <button class="btn" type="button" data-act="buy">Save buy price</button>
            <button class="btn ghost" type="button" data-act="watch">${row?.watched ? '★ Saved' : '☆ Save to watchlist'}</button>
        </div>
        <div class="links">
            <a href="https://www.amazon.in/dp/${esc(asin)}" target="_blank" rel="noopener">Amazon ↗</a>
            <a href="https://dir.indiamart.com/search.mp?ss=${search}" target="_blank" rel="noopener">IndiaMART ↗</a>
            <a href="https://www.udaan.com/search?q=${search}" target="_blank" rel="noopener">Udaan ↗</a>
            <a href="https://www.meesho.com/search?q=${search}" target="_blank" rel="noopener">Meesho ↗</a>
            <a href="https://www.flipkart.com/search?q=${search}" target="_blank" rel="noopener">Flipkart ↗</a>
        </div>
        <h2 class="gap-top">My note</h2>
        <textarea id="noteInput" placeholder="Supplier name, sample quality, MOQ...">${esc(info.note ?? '')}</textarea>
        <div class="row-actions"><button class="btn ghost" type="button" data-act="note">Save note</button></div>`;
    $('dBody').innerHTML = html;
    $('dBody').dataset.asin = asin;
}

function waterfall(lines) {
    const price = lines[0][1];
    let run = price;
    const rows = lines.map(([label, v], i) => {
        const from = i === 0 ? 0 : run + v;
        const width = Math.abs(v);
        if (i > 0) run += v;
        return `<div class="wf" data-tip="${esc(label)}: ${rupee(v)}"><span>${esc(label)}</span>
            <span class="wf-track"><span class="${i === 0 ? 'v-none' : 'v-cheap'}" style="left:${(from / price) * 100}%;width:${(width / price) * 100}%"></span></span>
            <span class="num">${rupee(v)}</span></div>`;
    });
    const ok = run > 0;
    rows.push(`<div class="wf total"><span>Profit per piece</span>
        <span class="wf-track">${ok ? `<span class="v-pick" style="left:0;width:${(run / price) * 100}%"></span>` : ''}</span>
        <span class="num">${rupee(run)}</span></div>`);
    return `<div class="waterfall">${rows.join('')}</div>`;
}

function lineChart(points, { invert = false, fmt = String } = {}) {
    if (points.length < 2) {
        return `<p class="muted">${points.length ? `Today: ${fmt(points[0][1])}. ` : ''}The chart starts after 2 days of data.</p>`;
    }
    const vals = points.map((p) => p[1]);
    const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
    const w = 600, h = 130, pad = 10;
    const xy = points.map((p, i) => {
        const t = (p[1] - min) / span;
        return [(i / (points.length - 1)) * w, pad + (invert ? t : 1 - t) * (h - pad * 2)];
    });
    const line = 'M' + xy.map((p) => p.join(',')).join('L');
    const top = invert ? min : max, bottom = invert ? max : min;
    return `<div class="chart" data-points='${esc(JSON.stringify(points.map((p, i) => [p[0], fmt(p[1]), xy[i][0] / w, xy[i][1] / h])))}'>
        <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
            <line class="grid" x1="0" x2="${w}" y1="${pad}" y2="${pad}"/><line class="grid" x1="0" x2="${w}" y1="${h - pad}" y2="${h - pad}"/>
            <path class="area" d="${line}L${w},${h}L0,${h}Z"/><path class="line" d="${line}"/>
            <line class="cross" x1="0" x2="0" y1="0" y2="${h}" hidden/>
        </svg>
        <span class="chart-y" style="top:0">${fmt(top)}</span><span class="chart-y" style="bottom:0">${fmt(bottom)}</span>
        <span class="marker" hidden></span>
    </div><div class="axis"><span>${points[0][0]}</span><span>${points[points.length - 1][0]}</span></div>`;
}

function chartHover(e) {
    const chart = e.target.closest('.chart');
    if (!chart) return;
    const pts = JSON.parse(chart.dataset.points);
    const box = chart.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width;
    const p = pts.reduce((best, q) => (Math.abs(q[2] - x) < Math.abs(best[2] - x) ? q : best));
    const svgBox = chart.querySelector('svg').getBoundingClientRect();
    const cross = chart.querySelector('.cross');
    cross.hidden = false;
    cross.setAttribute('x1', p[2] * 600);
    cross.setAttribute('x2', p[2] * 600);
    const marker = chart.querySelector('.marker');
    marker.hidden = false;
    marker.style.left = p[2] * svgBox.width + 'px';
    marker.style.top = p[3] * svgBox.height + 'px';
    showTip(`${p[0]}: ${p[1]}`, e);
}

// Suppliers and data

async function loadSuppliers() {
    const { rows } = await api('suppliers.php');
    const ok = rows.filter((r) => r.status === 'ok').length;
    setInfo(`${ok} of ${rows.length} supplier pages have prices. The bot checks 15 pages per run, IndiaMART blocks faster requests.`);
    $('keywordRows').innerHTML = rows.map((r) => `<tr>
        <td><b>${esc(r.keyword)}</b></td>
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
        ? `Last run: <b>${esc(run.started_at)} UTC</b> <span class="tag ${run.status === 'ok' ? 'ok' : run.status === 'running' ? 'new' : 'missing'}">${esc(run.status)}</span><br><span class="muted">${esc(run.message ?? 'Still running...')}</span>`
        : 'The bot has not run yet.';
    setInfo(`${num(status.products)} products tracked over ${status.days} day(s).`);
    $('catRows').innerHTML = status.categories.map((c) => `<tr>
        <td>${esc(c.name)}</td><td class="muted">${esc(c.parent)}</td><td class="num">${c.products}</td>
        <td>${c.last_status ? `<span class="tag ${c.last_status === 'ok' ? 'ok' : 'missing'}">${esc(c.last_status)}</span>` : '-'}</td>
        <td><input type="checkbox" data-cat="${c.id}" ${c.enabled == 1 ? 'checked' : ''}></td>
    </tr>`).join('');
    $('settingsGrid').innerHTML = status.settings.map((s) => `<label>${esc(s.label)}<input type="number" step="any" min="0" name="${s.key}" value="${s.value}"></label>`).join('');
}

// Tooltip and theme

function showTip(text, e) {
    const tip = $('tip');
    tip.textContent = text;
    tip.hidden = false;
    const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + 'px';
    tip.style.top = e.clientY + 16 + 'px';
}

function hideTip(e) {
    $('tip').hidden = true;
    const chart = e?.target.closest?.('.chart');
    if (chart) {
        chart.querySelector('.cross').hidden = true;
        chart.querySelector('.marker').hidden = true;
    }
}

function applyTheme(theme) {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
}

// Events

document.addEventListener('mousemove', (e) => {
    if (e.target.closest('.chart')) return chartHover(e);
    const el = e.target.closest('[data-tip]');
    if (el) showTip(el.dataset.tip, e);
    else $('tip').hidden = true;
});
document.addEventListener('mouseout', (e) => {
    if (e.target.closest('.chart') && !e.relatedTarget?.closest?.('.chart')) hideTip(e);
});

document.addEventListener('click', async (e) => {
    const item = e.target.closest('tr.click, .pcard');
    if (item) openProduct(item.dataset.asin);
    const act = e.target.closest('[data-act]');
    if (act) productAction(act.dataset.act);
    const lay = e.target.closest('[data-layout]');
    if (lay) {
        layout = lay.dataset.layout;
        store('layout', layout);
        loadList();
    }
    if (e.target.dataset.edit) {
        const f = $('keywordForm');
        f.keyword.value = e.target.dataset.edit;
        f.slug.value = e.target.dataset.slug;
        f.slug.focus();
    }
    if (e.target.dataset.del && confirm('Delete keyword "' + e.target.dataset.del + '"?')) {
        await api('suppliers.php', { action: 'delete', keyword: e.target.dataset.del });
        loadSuppliers();
    }
});

document.addEventListener('change', async (e) => {
    if (e.target.dataset.cat) {
        await api('status.php', { action: 'category', id: e.target.dataset.cat });
        await loadStatus();
    }
    if (e.target.dataset.step) renderPlan(await api('plan.php', { key: e.target.dataset.step }));
});

async function productAction(act) {
    const asin = $('dBody').dataset.asin;
    const body = { asin, action: act };
    if (act === 'buy') body.price = $('buyInput').value;
    if (act === 'note') body.note = $('noteInput').value;
    renderProduct(await api('product.php', body));
    if (LIST_VIEWS.includes(current)) loadList();
    if (current === 'home') loadHome();
}

$('dClose').addEventListener('click', () => $('drawer').close());
$('drawer').addEventListener('click', (e) => {
    if (e.target === $('drawer')) $('drawer').close();
});
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
        out.innerHTML = `<span class="tag ${d.verdict}">${VERDICTS[d.verdict]}</span>
            <div class="big-profit ${d.profit < 0 ? 'neg' : 'pos'}">${rupee(d.profit)} <small class="muted">per piece · ${d.margin}%</small></div>
            <p class="muted">${esc(d.reason)}</p>${waterfall(d.lines)}`;
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

$('themeBtn').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme
        ? document.documentElement.dataset.theme === 'dark'
        : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    applyTheme(next);
    store('theme', next);
});

// Opened as a file: PHP cannot run, so jump to the same page on XAMPP
if (location.protocol === 'file:' && location.pathname.includes('/htdocs/')) {
    location.replace('http://localhost/' + location.pathname.split('/htdocs/')[1].replace(/index\.html$/, '') + location.hash);
}

applyTheme(store('theme'));
window.addEventListener('hashchange', () => show(location.hash.slice(1)));
loadStatus()
    .then(() => {
        show(location.hash.slice(1) || 'home');
        if (current !== 'home') api('overview.php').then(setBadges).catch(() => {});
    })
    .catch((err) => {
        $('title').textContent = 'Cannot load data';
        $('lastSync').textContent = 'Not connected';
        const local = location.hostname === 'localhost' || location.protocol === 'file:';
        setInfo(local && err instanceof TypeError ? 'Start Apache in XAMPP, then open http://localhost/pr/product-radar/' : 'Error: ' + err.message);
    });
