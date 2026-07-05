{if isset($convor_slug) && $convor_slug}
{* Convor Live Chat *}
<script src="{$convor_api_base|escape:'htmlall':'UTF-8'}/widget.js" data-key="{$convor_slug|escape:'html':'UTF-8'}" async></script>
{/if}
