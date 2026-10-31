<?php

require __DIR__ . '/../src/bootstrap.php';

api(function () {
    $price = (float) param('price');
    $buy = (float) param('buy');
    if ($price <= 0 || $buy <= 0) {
        throw new InvalidArgumentException('Enter both prices');
    }
    $p = profit($price, $buy);
    [$verdict, $reason] = verdict($price, $buy, 0, $p);
    return $p + ['verdict' => $verdict, 'reason' => $reason];
});
