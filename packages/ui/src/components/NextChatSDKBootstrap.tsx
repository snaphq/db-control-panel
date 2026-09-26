import Script from "next/script";

export function NextChatSDKBootstrap({ baseUrl }: { baseUrl: string }) {
  const validatedBaseUrl = new URL(baseUrl);

  if (
    validatedBaseUrl.protocol !== "https:" &&
    validatedBaseUrl.protocol !== "http:"
  ) {
    throw new Error("baseUrl must use http: or https: protocol");
  }

  // baseUrl is sourced from server configuration in app/layout.tsx, so it is
  // treated as trusted application config rather than user input.
  return (
    <>
      <Script id="next-chat-sdk-base-url">
        {`window.innerBaseUrl = ${JSON.stringify(validatedBaseUrl.toString())};`}
      </Script>
      <Script id="next-chat-sdk-bootstrap">
        {`
(function() {
  const appOrigin = new URL(${JSON.stringify(validatedBaseUrl.toString())}).origin;
  const isInIframe = window.self !== window.top;
  
  // Only add base tag if we're in an iframe (ChatGPT Apps SDK context)
  // The assetPrefix in next.config.mjs already handles base URL for direct browser access
  if (isInIframe) {
    const baseTag = document.createElement('base');
    baseTag.href = ${JSON.stringify(validatedBaseUrl.toString())};
    const existingBase = document.querySelector('base');
    if (!existingBase) {
      document.head.insertBefore(baseTag, document.head.firstChild);
    }
  }
  
  // Protect HTML element from modifications
  const htmlElement = document.documentElement;
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.target === htmlElement) {
        const attrName = mutation.attributeName;
        if (attrName && attrName !== 'suppresshydrationwarning' && attrName !== 'class' && attrName !== 'style') {
          htmlElement.removeAttribute(attrName);
        }
      }
    });
  });
  observer.observe(htmlElement, { attributes: true });

  // Patch history API
  const originalReplaceState = history.replaceState;
  history.replaceState = function(state, unused, url) {
    const u = new URL(url ?? "", window.location.href);
    const href = u.pathname + u.search + u.hash;
    return originalReplaceState.call(this, state, unused, href);
  };

  const originalPushState = history.pushState;
  history.pushState = function(state, unused, url) {
    const u = new URL(url ?? "", window.location.href);
    const href = u.pathname + u.search + u.hash;
    return originalPushState.call(this, state, unused, href);
  };

  // Handle external links
  window.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a || !a.href) return;

    try {
      const url = new URL(a.href, window.location.href);
      const isExternal = url.origin !== window.location.origin && url.origin !== appOrigin;
      
      if (isExternal) {
        if (window.openai) {
          window.openai?.openExternal({ href: a.href });
          e.preventDefault();
        }
      }
    } catch {
      console.warn('openExternal failed, likely not in OpenAI client');
    }
  }, true);

  // Patch fetch API for cross-origin requests
  if (isInIframe && window.location.origin !== appOrigin) {
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
      let url;
      try {
        url = typeof input === 'string' ? new URL(input, window.location.href) : new URL(input.url, window.location.href);
      } catch {
        return originalFetch.call(window, input, init);
      }

      if (url.origin === appOrigin) {
        const newInit = { ...init, mode: 'cors' };
        return originalFetch.call(window, input, newInit);
      }

      if (url.origin === window.location.origin) {
        const newUrl = new URL(${JSON.stringify(validatedBaseUrl.toString())});
        newUrl.pathname = url.pathname;
        newUrl.search = url.search;
        newUrl.hash = url.hash;
        
        const newRequest = new Request(newUrl.toString(), init);
        const newInit = { ...init, mode: 'cors' };
        return originalFetch.call(window, newRequest, newInit);
      }

      return originalFetch.call(window, input, init);
    };
  }
})();
        `}
      </Script>
    </>
  );
}
