<?php

require __DIR__ . '/../src/bootstrap.php';

api(function () {
    if (is_post()) {
        $key = param('key');
        fetch_value('SELECT 1 FROM plan_steps WHERE key = ?', [$key])
            ? run_sql('DELETE FROM plan_steps WHERE key = ?', [$key])
            : run_sql('INSERT INTO plan_steps (key, done_at) VALUES (?, ?)', [$key, now()]);
    }
    return plan_status();
});
