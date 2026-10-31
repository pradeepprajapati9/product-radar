<?php

function latest_day(): ?string
{
    return fetch_value('SELECT MAX(day) FROM ranks') ?: null;
}

function data_days(): int
{
    return (int) fetch_value('SELECT COUNT(DISTINCT day) FROM ranks');
}

// Every tracked product with today's rank, 7-day change, buy price and profit verdict
function product_rows(): array
{
    $day = latest_day();
    if (!$day) {
        return [];
    }
    $rows = fetch_all("
        SELECT p.asin, p.name, p.image, p.buy_price, p.first_seen, c.name AS category, c.id AS category_id,
            r.rank, r.price, r.rating, r.reviews, o.rank AS old_rank, o.day AS old_day,
            w.asin IS NOT NULL AS watched
        FROM products p
        JOIN categories c ON c.id = p.category_id
        JOIN ranks r ON r.asin = p.asin AND r.category_id = p.category_id AND r.day = :day
        LEFT JOIN ranks o ON o.asin = p.asin AND o.category_id = p.category_id
            AND o.day = (SELECT MIN(day) FROM ranks WHERE day >= :week_ago)
        LEFT JOIN watch w ON w.asin = p.asin
    ", ['day' => $day, 'week_ago' => date('Y-m-d', strtotime($day . ' -7 days'))]);

    $keywords = supplier_keywords();
    $firstDay = fetch_value('SELECT MIN(day) FROM ranks');
    foreach ($rows as &$row) {
        // Postgres returns numbers as strings, so cast everything once here
        $row['category_id'] = (int) $row['category_id'];
        $row['rank'] = (int) $row['rank'];
        $row['old_rank'] = $row['old_rank'] !== null ? (int) $row['old_rank'] : null;
        $row['price'] = $row['price'] !== null ? (float) $row['price'] : null;
        $row['rating'] = $row['rating'] !== null ? (float) $row['rating'] : null;
        $row['reviews'] = $row['reviews'] !== null ? (int) $row['reviews'] : null;
        $row['watched'] = (bool) $row['watched'];
        $match = match_keyword($row['name'], $keywords);
        $row['keyword'] = $match['keyword'] ?? null;
        $row['slug'] = $match['slug'] ?? null;
        if ($row['buy_price']) {
            $row['buy'] = (float) $row['buy_price'];
            $row['buy_source'] = 'Your price';
        } elseif ($match && $match['median']) {
            $row['buy'] = (float) $match['median'];
            $row['buy_source'] = 'IndiaMART median of ' . $match['n'];
        } else {
            $row['buy'] = null;
            $row['buy_source'] = null;
        }
        $p = $row['price'] && $row['buy'] ? profit($row['price'], $row['buy']) : null;
        $row['profit'] = $p['profit'] ?? null;
        $row['margin'] = $p['margin'] ?? null;
        [$row['verdict'], $row['reason']] = verdict($row['price'], $row['buy'], $row['reviews'], $p);
        $row['change'] = $row['old_rank'] !== null && $row['old_day'] < $day ? $row['old_rank'] - $row['rank'] : null;
        $row['is_new'] = $row['first_seen'] === $day && $firstDay < $day;
        $row['url'] = 'https://www.amazon.in/dp/' . $row['asin'];
        unset($row['buy_price'], $row['old_day']);
    }
    return $rows;
}

function supplier_keywords(): array
{
    $rows = fetch_all('SELECT * FROM keywords');
    // Longer keywords first so "car air freshener" wins over "freshener"
    usort($rows, fn ($a, $b) => strlen($b['keyword']) <=> strlen($a['keyword']));
    return $rows;
}

function match_keyword(string $name, array $keywords): ?array
{
    $title = ' ' . strtolower(preg_replace('/[^a-z0-9]+/i', ' ', $name)) . ' ';
    foreach ($keywords as $k) {
        // Whole phrase in order, so "car duster" does not match "car vacuum ... duster"; "hanger" also matches "hangers"
        $words = array_map(fn ($w) => preg_quote($w, '/') . 's?', explode(' ', $k['keyword']));
        if (preg_match('/ ' . implode(' ', $words) . ' /', $title)) {
            return $k;
        }
    }
    return null;
}

function last_run(): ?array
{
    return fetch_all('SELECT * FROM runs ORDER BY id DESC LIMIT 1')[0] ?? null;
}
