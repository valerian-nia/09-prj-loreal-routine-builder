/* Add the class Cloudflare Worker URL here when it is available. */
const WORKER_URL = "https://loreal-routine-builder.valerian-e33.workers.dev/";

/* Get references to the page elements we update with JavaScript. */
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const languageDirection = document.getElementById("languageDirection");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const clearSelectedProductsButton = document.getElementById("clearSelectedProducts");
const generateRoutineButton = document.getElementById("generateRoutine");
const routineMessage = document.getElementById("routineMessage");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const webSearchToggle = document.getElementById("webSearchToggle");
const userInput = document.getElementById("userInput");
const sendButton = document.getElementById("sendBtn");

const storageKey = "selectedProductIds";
const directionStorageKey = "pageDirection";
const selectedProductIds = new Set();
let allProducts = [];
let isRequestInProgress = false;

/* Keep the system instructions and every later message for this conversation. */
const messages = [
  {
    role: "system",
    content:
      "You are a professional L'Oréal beauty and routine advisor. Create personalized routines using the selected product data supplied by the app. Use the actual product names, brands, categories, and descriptions to explain how the selected products can fit into a routine. Stay focused on L'Oréal beauty products and routines. The full conversation history will be sent with every request, so remember prior messages and your previous answers. Do not invent product information that was not provided, and do not provide medical diagnoses.",
  },
];

/* Set the page language and direction together. */
function applyPageDirection(language) {
  const languageCode = language === "ar" ? "ar" : "en";
  document.documentElement.lang = languageCode;
  document.documentElement.dir = languageCode === "ar" ? "rtl" : "ltr";
  languageDirection.value = languageCode;
}

/* Restore the last direction preference, or use English by default. */
function restorePageDirection() {
  let savedLanguage;

  try {
    savedLanguage = localStorage.getItem(directionStorageKey);
  } catch (error) {
    console.error("The page direction preference could not be read.", error);
  }

  applyPageDirection(savedLanguage);
}

restorePageDirection();

/* Save changes without affecting the product-selection storage. */
languageDirection.addEventListener("change", (event) => {
  const languageCode = event.target.value === "ar" ? "ar" : "en";
  applyPageDirection(languageCode);

  try {
    localStorage.setItem(directionStorageKey, languageCode);
  } catch (error) {
    console.error("The page direction preference could not be saved.", error);
  }
});

/* Show a placeholder until the user chooses a category. */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Load the product data from the JSON file. */
async function loadProducts() {
  const response = await fetch("products.json");

  if (!response.ok) {
    throw new Error("Could not load products.json");
  }

  const data = await response.json();
  return data.products;
}

/* Restore saved product IDs and ignore IDs that are not in products.json. */
function restoreSelectedProducts() {
  let savedProducts;

  try {
    savedProducts = localStorage.getItem(storageKey);
  } catch (error) {
    console.error("Saved product selections could not be accessed.", error);
    return;
  }

  if (!savedProducts) {
    return;
  }

  let savedProductIds;

  try {
    savedProductIds = JSON.parse(savedProducts);
  } catch (error) {
    console.warn("Saved product selections could not be read.", error);
    return;
  }

  if (!Array.isArray(savedProductIds)) {
    console.warn("Saved product selections were not a list.");
    return;
  }

  savedProductIds.forEach((savedId) => {
    const productId = Number(savedId);
    const productExists = allProducts.some((product) => product.id === productId);

    if (productExists) {
      selectedProductIds.add(productId);
    }
  });
}

/* Save the current selection so it is still here after a page reload. */
function saveSelectedProducts() {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...selectedProductIds]));
  } catch (error) {
    console.error("Product selections could not be saved.", error);
  }
}

/* Display products for the selected category and mark selected cards. */
function displayProducts(products) {
  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedProductIds.has(product.id);

      return `
        <article class="product-card${isSelected ? " selected" : ""}">
          <input
            class="product-checkbox visually-hidden"
            id="product-${product.id}"
            type="checkbox"
            data-product-id="${product.id}"
            aria-label="Select ${product.name}"
            ${isSelected ? "checked" : ""}
          >
          <label class="product-select" for="product-${product.id}">
            <img src="${product.image}" alt="">
            <span class="product-info">
              <span class="product-name">${product.name}</span>
              <span class="product-brand">${product.brand}</span>
            </span>
          </label>
          <button
            class="details-toggle"
            type="button"
            aria-expanded="false"
            aria-controls="description-${product.id}"
          >
            View Details
          </button>
          <p class="product-description" id="description-${product.id}" hidden>
            ${product.description}
          </p>
        </article>
      `;
    })
    .join("");
}

/* Apply the category and text filters together without changing selections. */
function displayFilteredProducts() {
  const searchTerm = productSearch.value.trim().toLowerCase();
  const filteredProducts = allProducts.filter((product) => {
    const matchesCategory =
      !categoryFilter.value || product.category === categoryFilter.value;
    const searchableDetails = [
      product.name,
      product.brand,
      product.category,
      product.description,
    ];
    const matchesSearch = searchableDetails.some(
      (detail) =>
        typeof detail === "string" &&
        detail.toLowerCase().includes(searchTerm)
    );

    return matchesCategory && matchesSearch;
  });

  if (filteredProducts.length === 0) {
    productsContainer.innerHTML =
      '<div class="placeholder-message">No products found.</div>';
    return;
  }

  displayProducts(filteredProducts);
}

/* Show all selected products with a button to remove each one. */
function displaySelectedProducts() {
  const selectedProducts = allProducts.filter((product) =>
    selectedProductIds.has(product.id)
  );

  selectedProductsList.innerHTML = selectedProducts.length
    ? selectedProducts
        .map(
          (product) => `
            <div class="selected-product" role="listitem">
              <span>${product.name}</span>
              <button
                class="remove-product"
                type="button"
                data-product-id="${product.id}"
                aria-label="Remove ${product.name} from selected products"
              >
                Remove
              </button>
            </div>
          `
        )
        .join("")
    : '<p class="empty-selection">No products selected yet.</p>';

  clearSelectedProductsButton.disabled = selectedProducts.length === 0;
}

/* Keep the saved list and visible product cards in sync after a change. */
function updateSelection() {
  saveSelectedProducts();
  displaySelectedProducts();
  routineMessage.textContent = "";
  displayFilteredProducts();
}

/* Load products once, restore the saved selection, and show the empty list. */
async function initializeProducts() {
  try {
    allProducts = await loadProducts();
    restoreSelectedProducts();
    displaySelectedProducts();

    if (categoryFilter.value || productSearch.value.trim()) {
      displayFilteredProducts();
    }
  } catch (error) {
    productsContainer.innerHTML = `
      <p class="placeholder-message">Products could not be loaded. Please try again later.</p>
    `;
    console.error("There was a problem loading products.", error);
  }
}

/* Reapply both filters whenever the category or search text changes. */
categoryFilter.addEventListener("change", displayFilteredProducts);
productSearch.addEventListener("input", displayFilteredProducts);

/* A native checkbox supports mouse, keyboard, and assistive technology input. */
productsContainer.addEventListener("change", (event) => {
  if (!event.target.matches(".product-checkbox")) {
    return;
  }

  const productId = Number(event.target.dataset.productId);

  if (event.target.checked) {
    selectedProductIds.add(productId);
  } else {
    selectedProductIds.delete(productId);
  }

  updateSelection();
});

/* Expand or collapse the description without changing the product selection. */
productsContainer.addEventListener("click", (event) => {
  const detailsButton = event.target.closest(".details-toggle");

  if (!detailsButton) {
    return;
  }

  const description = document.getElementById(
    detailsButton.getAttribute("aria-controls")
  );
  const isExpanded = detailsButton.getAttribute("aria-expanded") === "true";

  detailsButton.setAttribute("aria-expanded", String(!isExpanded));
  detailsButton.textContent = isExpanded ? "View Details" : "Hide Details";
  description.hidden = isExpanded;
});

/* Removing a product here also updates its checkbox if its card is visible. */
selectedProductsList.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".remove-product");

  if (!removeButton) {
    return;
  }

  selectedProductIds.delete(Number(removeButton.dataset.productId));
  updateSelection();
});

/* Clear every selected product at once. */
clearSelectedProductsButton.addEventListener("click", () => {
  selectedProductIds.clear();
  updateSelection();
});

/* Add source links returned by the Worker below an assistant's answer. */
function addSourceLinks(messageElement, sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return;
  }

  const validSources = sources
    .map((source) => {
      const sourceUrl =
        typeof source === "string"
          ? source.trim()
          : source && typeof source.url === "string"
            ? source.url.trim()
            : "";

      if (!sourceUrl) {
        return null;
      }

      let parsedUrl;

      try {
        parsedUrl = new URL(sourceUrl);
      } catch (error) {
        return null;
      }

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return null;
      }

      const sourceTitle =
        typeof source === "object" &&
        typeof source.title === "string" &&
        source.title.trim()
          ? source.title.trim()
          : sourceUrl;

      return { href: parsedUrl.href, title: sourceTitle };
    })
    .filter((source) => source !== null);

  if (validSources.length === 0) {
    return;
  }

  const sourcesSection = document.createElement("div");
  sourcesSection.className = "chat-message-sources";

  const heading = document.createElement("h3");
  heading.textContent = "Sources";
  sourcesSection.appendChild(heading);

  const sourceList = document.createElement("ul");

  validSources.forEach((source) => {
    const listItem = document.createElement("li");
    const link = document.createElement("a");

    link.href = source.href;
    link.textContent = source.title;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    listItem.appendChild(link);
    sourceList.appendChild(listItem);
  });

  sourcesSection.appendChild(sourceList);
  messageElement.appendChild(sourcesSection);
}

/* Add a clearly labeled message to the chat and scroll to the newest one. */
function addChatMessage(text, speaker, sources = []) {
  const messageElement = document.createElement("div");
  messageElement.className = `chat-message chat-message-${speaker}`;

  const speakerElement = document.createElement("p");
  speakerElement.className = "chat-speaker";
  speakerElement.textContent =
    speaker === "user" ? "You" : "Beauty Advisor";

  const textElement = document.createElement("p");
  textElement.className = "chat-message-text";
  textElement.textContent = text;

  messageElement.append(speakerElement, textElement);
  if (speaker === "assistant") {
    addSourceLinks(messageElement, sources);
  }
  chatWindow.appendChild(messageElement);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  return messageElement;
}

/* Send the complete conversation to the Cloudflare Worker. */
async function requestAdvisorResponse() {
  if (isRequestInProgress) {
    return;
  }

  isRequestInProgress = true;
  generateRoutineButton.disabled = true;
  sendButton.disabled = true;
  const webSearch = webSearchToggle.checked;
  const statusMessage = webSearch ? "Searching the web..." : "Thinking...";
  const thinkingMessage = addChatMessage(statusMessage, "thinking");

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages, webSearch }),
    });

    if (!response.ok) {
      throw new Error(`Worker request failed with status ${response.status}`);
    }

    const data = await response.json();
    const reply = data.choices[0].message.content;

    if (typeof reply !== "string") {
      throw new Error("The Worker response did not contain a text reply.");
    }

    messages.push({ role: "assistant", content: reply });
    addChatMessage(reply, "assistant", data.sources);
  } catch (error) {
    console.error("There was a problem contacting the beauty advisor.", error);
    addChatMessage(
      "Sorry, I couldn't connect to the beauty advisor. Please try again.",
      "error"
    );
  } finally {
    thinkingMessage.remove();
    isRequestInProgress = false;
    generateRoutineButton.disabled = false;
    sendButton.disabled = false;
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }
}

/* Ask for a routine using the full details of every selected product. */
generateRoutineButton.addEventListener("click", async () => {
  if (selectedProductIds.size === 0) {
    routineMessage.textContent = "Please select at least one product first.";
    return;
  }

  routineMessage.textContent = "";
  const selectedProducts = allProducts
    .filter((product) => selectedProductIds.has(product.id))
    .map((product) => ({
      name: product.name,
      brand: product.brand,
      category: product.category,
      description: product.description,
    }));
  const routineRequest = `Please build a personalized routine using these selected products:\n${JSON.stringify(
    selectedProducts,
    null,
    2
  )}`;

  messages.push({ role: "user", content: routineRequest });
  addChatMessage(routineRequest, "user");
  await requestAdvisorResponse();
});

/* Add follow-up questions to the same conversation and send its full history. */
chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const question = userInput.value.trim();

  if (!question || isRequestInProgress) {
    return;
  }

  messages.push({ role: "user", content: question });
  addChatMessage(question, "user");
  userInput.value = "";
  await requestAdvisorResponse();
});

initializeProducts();
