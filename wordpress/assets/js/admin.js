(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const slug = document.getElementById("convor_org_slug");
    if (!slug) {
      return;
    }

    // Normalize the org slug as the admin types it: lowercase and strip
    // anything that isn't a slug character. The server re-validates too.
    slug.addEventListener("input", () => {
      const start = slug.selectionStart;
      const end = slug.selectionEnd;
      const cleaned = slug.value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
      if (cleaned !== slug.value) {
        slug.value = cleaned;
        // Keep the caret position sane after stripping characters.
        slug.setSelectionRange(
          Math.min(start, cleaned.length),
          Math.min(end, cleaned.length)
        );
      }
    });

    const apiBase = document.getElementById("convor_api_base");
    if (apiBase) {
      apiBase.addEventListener("blur", () => {
        apiBase.value = apiBase.value.replace(/\/+$/, "");
      });
    }
  });
})();
