<?php

require __DIR__ . '/../src/bootstrap.php';

api(function () {
    if (is_post()) {
        match (param('action')) {
            'category' => run_sql('UPDATE categories SET enabled = 1 - enabled WHERE id = ?', [(int) param('id')]),
            'settings' => save_settings($_POST),
            default => throw new InvalidArgumentException('Unknown action'),
        };
    }
    $settings = settings();
    return [
        'last_run' => last_run(),
        'day' => latest_day(),
        'days' => data_days(),
        'products' => (int) fetch_value('SELECT COUNT(*) FROM products'),
        'categories' => fetch_all('SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS products
            FROM categories c ORDER BY parent, name'),
        'settings' => array_map(fn ($key, $d) => ['key' => $key, 'label' => $d[0], 'value' => $settings[$key]],
            array_keys(SETTING_DEFAULTS), SETTING_DEFAULTS),
        'runs' => fetch_all('SELECT * FROM runs ORDER BY id DESC LIMIT 10'),
    ];
});
