<?php

require __DIR__ . '/../src/bootstrap.php';

// cron-job.org calls this daily: /api/cron.php?token=CRON_TOKEN (add &log=1 to see the last bot output)
api(function () {
    $token = env_value('CRON_TOKEN');
    if (!$token || !hash_equals($token, param('token'))) {
        json_error('Wrong token', 403);
    }
    $log = sys_get_temp_dir() . '/radar_bot.log';
    if (param('log')) {
        return ['log' => is_file($log) ? file_get_contents($log) : 'No log yet', 'last_run' => last_run()];
    }
    $running = fetch_value(
        "SELECT started_at FROM runs WHERE status = 'running' AND started_at > ? ORDER BY id DESC LIMIT 1",
        [gmdate('Y-m-d H:i:s', time() - 1800)]
    );
    if ($running) {
        return ['started' => false, 'message' => 'Bot already running since ' . $running . ' UTC'];
    }
    $mode = in_array(param('mode'), ['amazon', 'suppliers'], true) ? param('mode') : '';
    // Start in the background so cron-job.org gets an answer at once
    exec(sprintf('cd %s && nohup python3 -X utf8 bot/radar_bot.py %s > %s 2>&1 &', escapeshellarg(dirname(__DIR__)), $mode, escapeshellarg($log)));
    return ['started' => true, 'message' => 'Bot started, takes about 8 minutes'];
}, true);
