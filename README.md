# Product Radar

Finds products worth reselling on Amazon India. A daily bot reads Amazon.in bestseller ranks and IndiaMART wholesale prices, and the dashboard shows the real profit per piece after GST, fees, shipping, returns and ads.

Open: http://localhost/pr/product-radar/

## Run the bot

```
run_bot.bat              Amazon ranks + due IndiaMART prices (about 8 min)
run_bot.bat amazon       only Amazon
run_bot.bat suppliers    only IndiaMART
```

Windows Task Scheduler runs it daily (task name `ProductRadar`). Needs Python with `requests` and `beautifulsoup4`.

## How it decides

A product is a **pick** when: sell price ≥ ₹450, sell ÷ buy ≥ 4, profit margin ≥ 20%, and it has ≤ 3,000 reviews. All of these and the fee numbers are editable on the **Data & settings** page.

Buy price comes from your own entry first, else the IndiaMART median for the first keyword found in the product name (Suppliers page).

## Limits

- Meesho blocks bots, so it is only linked for manual checks.
- IndiaMART rate-limits fast requests, so the bot checks 15 supplier pages per run and refreshes each weekly.
- Fee numbers are estimates from seller guides; confirm them in Seller Central before buying stock.
