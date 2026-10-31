<?php

require __DIR__ . '/../src/bootstrap.php';

api(function () {
    $asin = param('asin');
    if (!fetch_value('SELECT 1 FROM products WHERE asin = ?', [$asin])) {
        json_error('Product not found', 404);
    }
    if (is_post()) {
        match (param('action')) {
            'buy' => run_sql('UPDATE products SET buy_price = ? WHERE asin = ?', [
                is_numeric(param('price')) && param('price') > 0 ? (float) param('price') : null, $asin,
            ]),
            'watch' => fetch_value('SELECT 1 FROM watch WHERE asin = ?', [$asin])
                ? run_sql('DELETE FROM watch WHERE asin = ?', [$asin])
                : run_sql('INSERT INTO watch (asin, added_at) VALUES (?, ?)', [$asin, now()]),
            'note' => run_sql('UPDATE products SET note = ? WHERE asin = ?', [mb_substr(param('note'), 0, 500), $asin]),
            default => throw new InvalidArgumentException('Unknown action'),
        };
    }
    $row = array_values(array_filter(product_rows(), fn ($r) => $r['asin'] === $asin))[0] ?? null;
    $info = fetch_all('SELECT p.name, p.image, p.note, p.buy_price, c.name AS category FROM products p
        JOIN categories c ON c.id = p.category_id WHERE asin = ?', [$asin])[0];
    return [
        'row' => $row,
        'info' => $info,
        'breakdown' => $row && $row['price'] && $row['buy'] ? profit($row['price'], $row['buy'])['lines'] : null,
        'history' => fetch_all('SELECT r.day, r.rank, r.price, r.reviews FROM ranks r JOIN products p
            ON p.asin = r.asin AND p.category_id = r.category_id WHERE r.asin = ? ORDER BY r.day', [$asin]),
    ];
});
