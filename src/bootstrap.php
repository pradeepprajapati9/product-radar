<?php

declare(strict_types=1);

require_once __DIR__ . '/settings.php';
require_once __DIR__ . '/profit.php';
require_once __DIR__ . '/queries.php';
require_once __DIR__ . '/plan.php';

// Server env first, then the local .env file (never committed)
function env_value(string $key): ?string
{
    static $file = null;
    if ($file === null) {
        $file = [];
        $path = __DIR__ . '/../.env';
        foreach (is_file($path) ? file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) : [] as $line) {
            if (str_contains($line, '=') && $line[0] !== '#') {
                [$k, $v] = explode('=', $line, 2);
                $file[trim($k)] = trim($v);
            }
        }
    }
    $value = getenv($key);
    return $value !== false && $value !== '' ? $value : ($file[$key] ?? null);
}

// Postgres (Neon) when DATABASE_URL is set, else the local SQLite file
function db(): PDO
{
    static $pdo = null;
    if ($pdo) {
        return $pdo;
    }
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ];
    $schema = file_get_contents(__DIR__ . '/schema.sql');
    $url = env_value('DATABASE_URL');
    if ($url) {
        $u = parse_url($url);
        parse_str($u['query'] ?? '', $query);
        $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s;sslmode=%s', $u['host'], $u['port'] ?? 5432, ltrim($u['path'], '/'), $query['sslmode'] ?? 'require');
        $pdo = new PDO($dsn, urldecode($u['user']), urldecode($u['pass'] ?? ''), $options);
        $pdo->exec(str_replace('INTEGER PRIMARY KEY', 'SERIAL PRIMARY KEY', $schema));
        return $pdo;
    }
    $pdo = new PDO('sqlite:' . __DIR__ . '/../data/radar.sqlite', null, null, $options);
    $pdo->exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    $pdo->exec($schema);
    return $pdo;
}

function fetch_all(string $sql, array $args = []): array
{
    $stmt = db()->prepare($sql);
    $stmt->execute($args);
    return $stmt->fetchAll();
}

function fetch_value(string $sql, array $args = []): mixed
{
    $stmt = db()->prepare($sql);
    $stmt->execute($args);
    return $stmt->fetchColumn();
}

function run_sql(string $sql, array $args = []): void
{
    db()->prepare($sql)->execute($args);
}

function json_out(mixed $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function json_error(string $message, int $status = 400): never
{
    json_out(['error' => $message], $status);
}

function param(string $key, string $default = ''): string
{
    $value = $_GET[$key] ?? $_POST[$key] ?? $default;
    return is_string($value) ? trim($value) : $default;
}

function is_post(): bool
{
    return ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';
}

function api(callable $handler, bool $public = false): never
{
    // Online copy is locked with APP_PASSWORD (any username) so only you can change data
    $password = env_value('APP_PASSWORD');
    if (!$public && $password && !hash_equals($password, (string) ($_SERVER['PHP_AUTH_PW'] ?? ''))) {
        header('WWW-Authenticate: Basic realm="Product Radar"');
        json_error('Login needed', 401);
    }
    try {
        json_out($handler());
    } catch (InvalidArgumentException $e) {
        json_error($e->getMessage(), 400);
    } catch (Throwable $e) {
        error_log('[product-radar] ' . $e->getMessage());
        json_error('Server error: ' . $e->getMessage(), 500);
    }
}

function now(): string
{
    return gmdate('Y-m-d H:i:s');
}
