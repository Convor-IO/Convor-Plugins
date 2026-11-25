(() => {
  const state = document.currentScript?.dataset.state;
  const code = document.getElementById("convor-return-code")?.value;
  if (
    !/^[a-f0-9]{64}$/.test(state ?? "") ||
    !/^[A-Za-z0-9_-]{32}$/.test(code ?? "")
  )
    return;
  // Remove the grant from the visible address after it is read.
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState(null, "", url.href);
  if (typeof BroadcastChannel !== "function") return;
  const channel = new BroadcastChannel(`convor-prestashop-${state}`);
  channel.postMessage({ state, code });
  channel.close();
})();
