<?php

// Real profit per piece on Amazon Easy Ship after every cost
function profit(float $price, float $buy): array
{
    $s = settings();
    $referral = $price >= 1000 ? $price * $s['referral_pct'] / 100 : 0;
    $closing = $price <= 500 ? $s['closing_low'] : $s['closing_high'];
    $fees = ($referral + $closing + $s['ship']) * (1 + $s['fee_gst'] / 100);
    $saleGst = $price - $price / (1 + $s['sale_gst'] / 100);
    $landed = $buy * (1 + $s['freight_pct'] / 100) + $s['pack'];
    $returns = $price * $s['return_pct'] / 100;
    $ads = $price * $s['ads_pct'] / 100;
    $profit = $price - $saleGst - $fees - $landed - $returns - $ads;

    return [
        'profit' => round($profit),
        'margin' => $price > 0 ? round($profit / $price * 100) : 0,
        'lines' => [
            ['Sell price', round($price)],
            ['GST on sale', -round($saleGst)],
            ['Amazon fees + shipping (with GST)', -round($fees)],
            ['Buy price + freight + packing', -round($landed)],
            ['Returns loss', -round($returns)],
            ['Ads', -round($ads)],
        ],
    ];
}

// One word verdict + the reason, using the pick rules from settings
function verdict(?float $price, ?float $buy, ?int $reviews, ?array $p): array
{
    $s = settings();
    if (!$price) {
        return ['none', 'No price on Amazon'];
    }
    if ($price < $s['min_price']) {
        return ['cheap', 'Under ₹' . $s['min_price'] . ', fixed costs eat the profit'];
    }
    if (!$buy) {
        return ['supplier', 'Price OK, add a buy price to check profit'];
    }
    if ($price / $buy < $s['min_multiple'] || $p['margin'] < $s['min_margin']) {
        return ['low', 'Profit too low (' . $p['margin'] . '%)'];
    }
    if ($reviews > $s['max_reviews']) {
        return ['brand', 'Has ' . number_format((int) $reviews) . ' reviews, hard to beat'];
    }
    return ['pick', 'Good: ₹' . $p['profit'] . ' profit per piece (' . $p['margin'] . '%)'];
}
