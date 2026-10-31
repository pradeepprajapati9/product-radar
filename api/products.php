<?php

require __DIR__ . '/../src/bootstrap.php';

api(function () {
    $rows = product_rows();
    $view = param('view', 'all');
    $q = strtolower(param('q'));
    $cat = (int) param('cat');
    $verdict = param('verdict');

    $rows = array_values(array_filter($rows, function ($r) use ($view, $q, $cat, $verdict) {
        return match ($view) {
            'picks' => $r['verdict'] === 'pick',
            'supplier' => $r['verdict'] === 'supplier' && $r['reviews'] <= settings()['max_reviews'],
            'rising' => $r['is_new'] || ($r['change'] ?? 0) >= 10,
            'watch' => $r['watched'],
            default => true,
        } && (!$q || str_contains(strtolower($r['name']), $q))
          && (!$cat || $r['category_id'] === $cat)
          && (!$verdict || $r['verdict'] === $verdict);
    }));

    $sort = param('sort', $view === 'picks' ? 'profit' : ($view === 'rising' ? 'change' : 'rank'));
    usort($rows, fn ($a, $b) => match ($sort) {
        'profit' => ($b['profit'] ?? -9999) <=> ($a['profit'] ?? -9999),
        'change' => ($b['is_new'] <=> $a['is_new']) ?: (($b['change'] ?? 0) <=> ($a['change'] ?? 0)),
        'reviews' => ($a['reviews'] ?? 0) <=> ($b['reviews'] ?? 0),
        'price' => ($b['price'] ?? 0) <=> ($a['price'] ?? 0),
        default => $a['rank'] <=> $b['rank'],
    });

    $limit = $view === 'all' ? 300 : 60;
    return ['total' => count($rows), 'rows' => array_slice($rows, 0, $limit), 'day' => latest_day()];
});
