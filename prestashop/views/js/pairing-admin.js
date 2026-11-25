(() => {
  const form = document.getElementById("convor-pair-complete");
  if (!form || typeof BroadcastChannel !== "function") return;
  const state = form.elements.namedItem("CONVOR_PAIR_STATE")?.value;
  if (!/^[a-f0-9]{64}$/.test(state ?? "")) return;
  const channel = new BroadcastChannel(`convor-prestashop-${state}`);
  channel.onmessage = ({ data }) => {
    if (data?.state !== state || !/^[A-Za-z0-9_-]{32}$/.test(data?.code ?? ""))
      return;
    channel.close();
    form.elements.namedItem("CONVOR_PAIR_CODE").value = data.code;
    form.requestSubmit();
  };
  window.addEventListener("pagehide", () => channel.close(), { once: true });
})();
