<?php

// Launch plan: [key, step, detail]; steps with an "auto" check tick themselves from the data
function plan_phases(): array
{
    return [
        [
            'title' => 'Find the product',
            'when' => 'Week 1-2',
            'cost' => '₹0',
            'steps' => [
                ['bot7', 'Let the bot collect 7 days of data', 'Run it daily. Rank trends and "Rising fast" need a week to be useful.', 'auto' => fn () => data_days() >= 7],
                ['buy10', 'Add buy prices for 10 products', 'Open "Need buy price", search IndiaMART or Udaan, type the price. More prices = more picks.', 'auto' => fn () => (int) fetch_value('SELECT COUNT(*) FROM products WHERE buy_price > 0') >= 10],
                ['watch3', 'Shortlist 3 products in the watchlist', 'Only products marked "Good" that still look good after 7 days.', 'auto' => fn () => (int) fetch_value('SELECT COUNT(*) FROM watch') >= 3],
                ['reviews', 'Read the 1-2 star reviews of each', 'Complaints tell you what to fix (size, smell, packing). That is how a new seller wins.'],
                ['other', 'Check the same product on Meesho and Flipkart', 'If it is much cheaper there, Amazon buyers may move. Note the lowest price.'],
            ],
        ],
        [
            'title' => 'Paperwork',
            'when' => 'Week 2-3',
            'cost' => '₹0 (self-filed)',
            'steps' => [
                ['pan', 'PAN, Aadhaar and a bank account ready', 'A savings account works to start. Keep business money separate if you can.'],
                ['gst', 'Apply for GST registration', 'Free on gst.gov.in, about 7 working days. Amazon and Flipkart need it to sell across India.'],
                ['udyam', 'Udyam (MSME) registration', 'Free on udyamregistration.gov.in, 10 minutes with Aadhaar.'],
                ['ca', 'One call with a CA about GST returns', 'Ask about monthly filing and TCS that marketplaces deduct. Many charge ₹500-1,000/month.'],
            ],
        ],
        [
            'title' => 'Samples and supplier',
            'when' => 'Week 3',
            'cost' => '₹1,500-3,000',
            'steps' => [
                ['contact', 'Contact 3 suppliers per shortlisted product', 'IndiaMART "Get best price". Ask: price for 50 pcs, MOQ, GST bill, delivery time.'],
                ['samples', 'Order samples (2-5 pieces each)', 'Never buy bulk before you hold the product in your hand.'],
                ['quality', 'Test quality and fix the real buy price', 'Include courier to you. Save the final price on the product so profit is exact.'],
                ['pick1', 'Pick ONE product to launch', 'The one with best profit after real price and a reliable supplier.'],
            ],
        ],
        [
            'title' => 'Listing',
            'when' => 'Week 4',
            'cost' => '₹500-1,000',
            'steps' => [
                ['account', 'Create Amazon seller account (Easy Ship)', 'sell.amazon.in. Free. Easy Ship = Amazon courier picks up from your home.'],
                ['photos', 'Take 6-7 clean photos', 'White background, good light, phone camera is fine. One photo showing size, one in use.'],
                ['listing', 'Write the title and 5 bullet points', 'Copy the keywords that top sellers use. Bullets answer the complaints from the bad reviews.'],
                ['meesho', 'Also list on Meesho', 'Same product, second channel. Meesho needs no commission, only shipping.'],
            ],
        ],
        [
            'title' => 'Launch',
            'when' => 'Month 2',
            'cost' => '₹10,000-15,000',
            'steps' => [
                ['stock', 'Buy the first stock (30-50 pieces)', 'Small first order. Ask for the GST bill.'],
                ['ads', 'Run Sponsored Products ads, ₹200-300/day', 'Ads give the first sales. Organic sales come after reviews.'],
                ['reviews5', 'Get the first 5-10 reviews', 'Use Amazon\'s "Request a review" button on every order. Never buy fake reviews (account ban).'],
                ['track', 'Track sales, returns and real profit weekly', 'Compare real profit with the radar number. Fix the settings if fees differ.'],
            ],
        ],
        [
            'title' => 'Decide and grow',
            'when' => 'Month 3+',
            'cost' => 'From profit',
            'steps' => [
                ['rule', 'Apply the 30-day rule', 'Under 1 sale/day after 30 days with ads = stop and sell the rest. 2+/day = reorder.'],
                ['second', 'Add the second product', 'Next pick from the radar. Same steps, faster this time.'],
                ['brand', 'Start your own brand name', 'Same products under one name and packaging. Trademark filing ₹4,500 for an individual.'],
            ],
        ],
    ];
}

function plan_status(): array
{
    $done = array_column(fetch_all('SELECT key, done_at FROM plan_steps'), 'done_at', 'key');
    $phases = plan_phases();
    $total = $complete = 0;
    $next = null;
    foreach ($phases as &$phase) {
        $phaseDone = 0;
        foreach ($phase['steps'] as &$step) {
            $auto = isset($step['auto']);
            $isDone = $auto ? ($step['auto'])() : isset($done[$step[0]]);
            $step = ['key' => $step[0], 'title' => $step[1], 'detail' => $step[2], 'auto' => $auto, 'done' => $isDone];
            $total++;
            if ($isDone) {
                $complete++;
                $phaseDone++;
            } elseif (!$next) {
                $next = $step['title'];
            }
        }
        $phase['done'] = $phaseDone;
    }
    return ['phases' => $phases, 'total' => $total, 'complete' => $complete, 'next' => $next];
}
