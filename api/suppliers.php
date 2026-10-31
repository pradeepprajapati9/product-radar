<?php

require __DIR__ . '/../src/bootstrap.php';

api(function () {
    if (is_post()) {
        $keyword = strtolower(preg_replace('/\s+/', ' ', param('keyword')));
        $slug = strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', param('slug')), '-'));
        match (param('action')) {
            'save' => $keyword && $slug
                ? run_sql("INSERT INTO keywords (keyword, slug) VALUES (?, ?)
                    ON CONFLICT(keyword) DO UPDATE SET slug = excluded.slug, status = 'new', n = 0,
                    min_price = NULL, p25 = NULL, median = NULL, checked_at = NULL", [$keyword, $slug])
                : throw new InvalidArgumentException('Enter a keyword and an IndiaMART page name'),
            'delete' => run_sql('DELETE FROM keywords WHERE keyword = ?', [$keyword]),
            default => throw new InvalidArgumentException('Unknown action'),
        };
    }
    $matched = [];
    $keywords = supplier_keywords();
    foreach (fetch_all('SELECT name FROM products') as $p) {
        $k = match_keyword($p['name'], $keywords);
        if ($k) {
            $matched[$k['keyword']] = ($matched[$k['keyword']] ?? 0) + 1;
        }
    }
    $rows = fetch_all('SELECT * FROM keywords ORDER BY status = \'ok\' DESC, keyword');
    foreach ($rows as &$r) {
        $r['products'] = $matched[$r['keyword']] ?? 0;
        $r['url'] = 'https://dir.indiamart.com/impcat/' . $r['slug'] . '.html';
    }
    return ['rows' => $rows];
});
