<?php

declare(strict_types=1);

require_once __DIR__ . '/settings.php';
require_once __DIR__ . '/profit.php';
require_once __DIR__ . '/queries.php';
require_once __DIR__ . '/plan.php';

function db(): PDO
{
    static $pdo = null;
    if ($pdo) {
        return $pdo;
    }
    $path = __DIR__ . '/../data/radar.sqlite';
    $pdo = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    $pdo->exec(file_get_contents(__DIR__ . '/schema.sql'));
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

function api(callable $handler): never
{
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
