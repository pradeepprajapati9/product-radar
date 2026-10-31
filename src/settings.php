<?php

// Fee numbers are estimates from seller guides (Oct 2026), editable on the Data page
const SETTING_DEFAULTS = [
    'ship' => ['Shipping per order (₹)', 60],
    'closing_low' => ['Closing fee, price up to ₹500 (₹)', 12],
    'closing_high' => ['Closing fee, price above ₹500 (₹)', 26],
    'referral_pct' => ['Referral fee for ₹1000+ items (%)', 12],
    'fee_gst' => ['GST on Amazon fees (%)', 18],
    'sale_gst' => ['GST on your sale (%)', 18],
    'return_pct' => ['Returns loss (% of price)', 10],
    'ads_pct' => ['Ads cost (% of price)', 15],
    'pack' => ['Packaging per piece (₹)', 12],
    'freight_pct' => ['Freight + damage on buying (%)', 10],
    'min_price' => ['Pick rule: lowest sell price (₹)', 450],
    'min_multiple' => ['Pick rule: sell price ÷ buy price at least', 4],
    'min_margin' => ['Pick rule: profit margin at least (%)', 20],
    'max_reviews' => ['Pick rule: top seller reviews at most', 3000],
];

function settings(): array
{
    static $values = null;
    if ($values !== null) {
        return $values;
    }
    $values = array_map(fn ($d) => $d[1], SETTING_DEFAULTS);
    foreach (fetch_all('SELECT key, value FROM settings') as $row) {
        if (isset($values[$row['key']]) && is_numeric($row['value'])) {
            $values[$row['key']] = (float) $row['value'];
        }
    }
    return $values;
}

function save_settings(array $input): void
{
    foreach (SETTING_DEFAULTS as $key => $_) {
        if (isset($input[$key]) && is_numeric($input[$key]) && $input[$key] >= 0) {
            run_sql('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [$key, (string) $input[$key]]);
        }
    }
}
