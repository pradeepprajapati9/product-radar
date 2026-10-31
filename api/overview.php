<?php

require __DIR__ . '/../src/bootstrap.php';

api(function () {
    $rows = product_rows();
    $verdicts = array_count_values(array_column($rows, 'verdict'));
    $picks = array_values(array_filter($rows, fn ($r) => $r['verdict'] === 'pick'));
    usort($picks, fn ($a, $b) => $b['profit'] <=> $a['profit']);

    // Opportunity per category = picks + products that only miss a buy price
    $cats = [];
    foreach ($rows as $r) {
        $c = &$cats[$r['category']];
        $c ??= ['name' => $r['category'], 'products' => 0, 'picks' => 0, 'supplier' => 0];
        $c['products']++;
        $c['picks'] += $r['verdict'] === 'pick';
        $c['supplier'] += $r['verdict'] === 'supplier';
    }
    unset($c);
    $cats = array_values($cats);
    usort($cats, fn ($a, $b) => ($b['picks'] * 3 + $b['supplier']) <=> ($a['picks'] * 3 + $a['supplier']));

    $bands = ['Under ₹200' => 0, '₹200-449' => 0, '₹450-999' => 0, '₹1,000+' => 0];
    foreach ($rows as $r) {
        if ($r['price']) {
            $bands[match (true) {
                $r['price'] < 200 => 'Under ₹200',
                $r['price'] < 450 => '₹200-449',
                $r['price'] < 1000 => '₹450-999',
                default => '₹1,000+',
            }]++;
        }
    }
    $plan = plan_status();

    return [
        'day' => latest_day(),
        'days' => data_days(),
        'kpi' => [
            'products' => count($rows),
            'picks' => count($picks),
            'supplier' => $verdicts['supplier'] ?? 0,
            'best' => $picks[0]['profit'] ?? null,
            'rising' => count(array_filter($rows, fn ($r) => $r['is_new'] || ($r['change'] ?? 0) >= 10)),
        ],
        'verdicts' => $verdicts,
        'top' => array_slice($picks, 0, 6),
        'categories' => array_slice($cats, 0, 8),
        'bands' => array_map(fn ($k, $v) => ['label' => $k, 'n' => $v], array_keys($bands), $bands),
        'plan' => ['complete' => $plan['complete'], 'total' => $plan['total'], 'next' => $plan['next']],
    ];
});
