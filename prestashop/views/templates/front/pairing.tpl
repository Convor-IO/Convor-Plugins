<!doctype html>
<html lang="{$convor_language|escape:'htmlall':'UTF-8'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{l s='Return to PrestaShop' mod='convor'}</title>
</head>
<body>
  <main>
    <h1>{l s='Return to your module settings' mod='convor'}</h1>
    <p>{l s='Return to the original PrestaShop administration tab to finish the connection.' mod='convor'}</p>
    <p>{l s='If it did not finish automatically, copy this connection code:' mod='convor'}</p>
    <label for="convor-return-code">{l s='Connection code' mod='convor'}</label>
    <input id="convor-return-code" readonly value="{$convor_pair_code|escape:'htmlall':'UTF-8'}">
    <script src="{$convor_pair_script|escape:'htmlall':'UTF-8'}" data-state="{$convor_pair_state|escape:'htmlall':'UTF-8'}" defer></script>
  </main>
</body>
</html>
