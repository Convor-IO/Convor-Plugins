<div class="panel">
  <div class="panel-heading">{l s='Connect your Convor website' mod='convor'}</div>
  {if $convor_has_key}
    {if $convor_enabled}
      <p>{l s='A public widget key is saved. Send a test message to verify the connection.' mod='convor'}</p>
    {else}
      <p>{l s='The widget is disabled. Its public key is still saved.' mod='convor'}</p>
    {/if}
  {else}
    <p>{l s='No public widget key is saved.' mod='convor'}</p>
  {/if}
  {if $convor_has_key && $convor_website_name}
    <p>{l s='Last paired website' mod='convor'}: <strong>{$convor_website_name|escape:'htmlall':'UTF-8'}</strong></p>
  {/if}
  {if $convor_has_key && $convor_enabled && $convor_storefront_url}
    <p><a class="btn btn-default" href="{$convor_storefront_url|escape:'htmlall':'UTF-8'}" target="_blank" rel="noopener noreferrer">{l s='Open storefront to test chat' mod='convor'}</a></p>
  {/if}
  <form method="post" action="{$convor_pair_action|escape:'htmlall':'UTF-8'}">
    <input type="hidden" name="token" value="{$convor_pair_token|escape:'htmlall':'UTF-8'}">
    <button class="btn btn-default" name="submitConvorPairStart" value="1" type="submit">
      {l s='Connect with Convor' mod='convor'}
    </button>
  </form>
  {if $convor_pair_url}
    <p class="help-block">{l s='Open Convor in a new tab, select your website and confirm. Keep this tab open.' mod='convor'}</p>
    <p><a class="btn btn-primary" href="{$convor_pair_url|escape:'htmlall':'UTF-8'}" target="_blank" rel="noopener noreferrer">{l s='Open Convor' mod='convor'}</a></p>
    <form id="convor-pair-complete" method="post" action="{$convor_pair_action|escape:'htmlall':'UTF-8'}">
      <input type="hidden" name="token" value="{$convor_pair_token|escape:'htmlall':'UTF-8'}">
      <input type="hidden" name="submitConvorPairComplete" value="1">
      <input type="hidden" name="CONVOR_PAIR_STATE" value="{$convor_pair_state|escape:'htmlall':'UTF-8'}">
      <div class="form-group">
        <label for="convor-pair-code">{l s='Connection code' mod='convor'}</label>
        <input class="form-control" id="convor-pair-code" name="CONVOR_PAIR_CODE" maxlength="32" autocomplete="off" required>
        <p class="help-block">{l s='If the connection does not finish automatically, copy the code from the return page.' mod='convor'}</p>
      </div>
      <button class="btn btn-primary" type="submit">{l s='Finish connection' mod='convor'}</button>
    </form>
    <script src="{$convor_pair_script|escape:'htmlall':'UTF-8'}" defer></script>
  {/if}
  <p><a href="{$convor_guide_url|escape:'htmlall':'UTF-8'}" target="_blank" rel="noopener noreferrer">{l s='Installation guide' mod='convor'}</a></p>
</div>
