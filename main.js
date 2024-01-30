const cryptoTypes = ['ethereum', 'bitcoin', 'dogecoin'];

async function viewsToCrypto(viewCount, cryptoType) {
  const numberPattern = /([\d,.]+)([kmb]*)/i;
  const matches = viewCount.match(numberPattern);

  if (!matches) {
    return NaN; // Return NaN if the input doesn't match the expected pattern
  }

  const numericPart = matches[1];
  const multiplier = matches[2].toLowerCase();

  let viewsNormalized;

  const lastChars = [
    numericPart.slice(-1),
    numericPart.slice(-2, -1),
    numericPart.slice(-3, -2),
  ];

  // Check if second or third to last character are , or . to handle international numbers
  if (lastChars.includes(".") || lastChars.includes(",")) {
    const parts = numericPart.replace(",", ".").split(".");
    const integerPart = parts[0].replace(/[,]/g, "");
    const decimalPart = parts[1] ? parts[1] : "0";
    viewsNormalized = parseFloat(integerPart + "." + decimalPart);
  } else {
    viewsNormalized = parseFloat(numericPart.replaceAll(",", ""));
  }

  let factor = 1;

  switch (multiplier) {
    case "k":
      factor = 1000;
      break;
    case "m":
      factor = 1000000;
      break;
    case "b":
      factor = 1000000000;
      break;
  }

  let totalViews = Math.round(viewsNormalized * factor)

  let totalDollars = totalViewsToDollars(totalViews);

  let symbol = cryptoTypeToSymbol(cryptoType);

  let cryptoAmount = await usdToCrypto(totalDollars, cryptoType);

  console.log(`Total views: ${totalViews}`);
  console.log(`Total dollars: ${totalDollars}`);
  console.log(`Crypto amount: ${cryptoAmount}`);

  var processed = () => {
    if (cryptoAmount < 0.1) return cryptoAmount.toFixed(5);
    return cryptoAmount.toFixed(2);
  }

  var processedDollars = () => {
    if (totalDollars < 0.1) return totalDollars.toFixed(5);
    return totalDollars.toFixed(2);
  }

  let result = `${processed()} ($${processedDollars()})`;

  console.log(`Result: ${result}`);

  return result;
}

function cryptoTypeToSymbol(cryptoType) {
  switch (cryptoTypes.indexOf(cryptoType)) {
    case 0: // ethereum
      return 'Ξ';
    case 1: // bitcoin
      return '₿';
    case 2: // dogecoin
      return 'Ð';
  }
}

function totalViewsToDollars(views) {
  const processed = views * 0.000026;
  return processed;
}

async function getCryptoUSDValue(cryptoName) {
  try {
    let usd = 0;

    await new Promise((resolve, reject) => {
      // try to get the value from chrome extension storage
      chrome.storage.sync.get([cryptoName], async function (result) {
        let cache = result[cryptoName];

        if (cache?.expireTime <= new Date().getTime()) {
          console.log(`Cache for ${cryptoName} expired, getting new value`);
          cache = null;
        }

        if (cache) {
          usd = cache.usd;
          console.log(`Got ${cryptoName} value from storage: ${usd}`);
          resolve();
        } else {
          let ttl = 60 * 60 // 1 hour
          let expireTime = new Date().getTime() + ttl * 1000;

          let apiCall = new XMLHttpRequest();
          apiCall.open('GET', `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoName}&vs_currencies=usd`, false);
          apiCall.send(null);
          let response = JSON.parse(apiCall.responseText);

          const data = await response?.[cryptoName];

          console.log(`Got ${cryptoName} value from API: `, response);

          usd = data.usd;

          //  store to chrome extension storage
          chrome.storage.sync.set({ [cryptoName]: { expireTime, usd } }, function () {
            console.log(`Set ${cryptoName} value to storage: ${usd}`);
            resolve();
          });
        }
      });
    })

    return usd;
  } catch (error) {
    console.error(`Could not fetch conversion rate for ${cryptoName}: ${error}`);
    return null;
  }
}

async function usdToCrypto(usd, cryptoName) {
  const cryptoUSDValue = await getCryptoUSDValue(cryptoName);
  console.log(`Crypto USD value: `, cryptoUSDValue);
  return usd / cryptoUSDValue;
}

const globalSelectors = {};
globalSelectors.postCounts = `[role="group"][id*="id__"]:only-child`;
globalSelectors.articleDate = `[role="article"][aria-labelledby*="id__"][tabindex="-1"] time`;
globalSelectors.analyticsLink = " :not(.dollarBox)>a[href*='/analytics']";
globalSelectors.viewCount =
  globalSelectors.postCounts + globalSelectors.analyticsLink;

const innerSelectors = {};
innerSelectors.dollarSpot = "div div:first-child";
innerSelectors.viewSVG = "div div:first-child svg";
innerSelectors.viewAmount = "div div:last-child span span span";
innerSelectors.articleViewAmount = "span div:first-child span span span";

async function doWork() {
  for (const cryptoType of cryptoTypes) {
    await getCryptoUSDValue(cryptoType);
  }

  let cryptoType = cryptoTypes[0]; // todo - make this configurable

  const viewCounts = Array.from(
    document.querySelectorAll(globalSelectors.viewCount)
  );

  const articleViewDateSections = document.querySelectorAll(globalSelectors.articleDate);

  if (articleViewDateSections.length) {
    let rootDateViewsSection = articleViewDateSections[articleViewDateSections.length - 1].parentElement.parentElement.parentElement;

    if (rootDateViewsSection?.children?.length !== 1 && rootDateViewsSection?.children.length < 4) {
      const clonedDateViewSeparator = rootDateViewsSection?.children[1].cloneNode(true);
      const clonedDateView = rootDateViewsSection?.children[2].cloneNode(true);

      rootDateViewsSection?.insertBefore(clonedDateViewSeparator, rootDateViewsSection?.children[2].nextSibling);
      rootDateViewsSection?.insertBefore(clonedDateView, rootDateViewsSection?.children[3].nextSibling);

      const viewCountValue = clonedDateView?.querySelector(innerSelectors.articleViewAmount)?.textContent;
      const cryptoAmount = await viewsToCrypto(viewCountValue, cryptoType);

      clonedDateView.querySelector(innerSelectors.articleViewAmount).textContent = `${cryptoTypeToSymbol(cryptoType)} ${cryptoAmount}`;
      clonedDateView.querySelector(`span`).children[1].remove();
    }
  }

  for (const view of viewCounts) {
    if (!view.classList.contains("replaced")) {
      view.classList.add("replaced");

      const parent = view.parentElement;
      const cryptoBox = parent.cloneNode(true);
      cryptoBox.classList.add("cryptoBox");

      parent.parentElement.insertBefore(cryptoBox, parent.nextSibling);

      const oldIcon = cryptoBox.querySelector(innerSelectors.viewSVG);
      oldIcon?.remove();

      const cryptoSpot = cryptoBox.querySelector(innerSelectors.dollarSpot)?.firstChild?.firstChild;
      cryptoSpot.textContent = cryptoTypeToSymbol(cryptoType);
      cryptoSpot.style.marginTop = "-0.6rem";
    }

    const cryptoBox = view.parentElement.nextSibling.firstChild;
    const viewCount = view.querySelector(innerSelectors.viewAmount)?.textContent;
    if (viewCount == undefined) continue;
    const cryptoAmountArea = cryptoBox.querySelector(innerSelectors.viewAmount);

    if (!cryptoAmountArea) continue;

    cryptoAmountArea.textContent = await viewsToCrypto(viewCount, cryptoType);
  }
}

function throttle(func, limit) {
  let lastFunc;
  let lastRan;
  return function () {
    const context = this;
    const args = arguments;
    if (!lastRan) {
      func.apply(context, args);
      lastRan = Date.now();
    } else {
      clearTimeout(lastFunc);
      lastFunc = setTimeout(function () {
        if (Date.now() - lastRan >= limit) {
          func.apply(context, args);
          lastRan = Date.now();
        }
      }, limit - (Date.now() - lastRan));
    }
  };
}

// Function to start MutationObserver
const observe = () => {
  const runDocumentMutations = throttle(() => {
    requestAnimationFrame(doWork);
  }, 1000);

  const observer = new MutationObserver((mutationsList) => {
    if (!mutationsList.length) return;
    runDocumentMutations();
  });

  observer.observe(document, {
    childList: true,
    subtree: true,
  });
};

observe();