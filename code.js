// code.js
figma.showUI(__html__, { 
  width: 400, 
  height: 600,
  themeColors: true 
});

// Helper function to get appropriate font for text type
async function getFontForTextType(textType) {
  let fontName;

  switch (textType) {
    case 'headline':
      fontName = { family: 'Gilroy', style: 'SemiBold' }; // Correct font for Headlines
      break;
    case 'subheadline':
    case 'disclaimer':
      fontName = { family: 'Inter', style: 'Medium' }; // Correct font for Subheadline and Disclaimer
      break;
    default:
      fontName = { family: 'Inter', style: 'Regular' };
  }

  try {
    await figma.loadFontAsync(fontName);
    return fontName;
  } catch (error) {
    console.warn(`Failed to load font ${fontName.family} ${fontName.style}, falling back to Inter Regular`);
    const fallbackFont = { family: 'Inter', style: 'Regular' };
    await figma.loadFontAsync(fallbackFont);
    return fallbackFont;
  }
}

// New functionality: Combine selected components as variants into a component set
async function combineSelectedAsVariants() {
  // Get only selected COMPONENT nodes
  const selectedComponents = figma.currentPage.selection.filter(node => node.type === 'COMPONENT');
  if (selectedComponents.length < 2) {
    figma.notify('Select at least two components to combine as variants.');
    return;
  }

  // Combine as variants
  const set = figma.combineAsVariants(selectedComponents, figma.currentPage);
  set.name = 'Combined Component Set';

  // Only add Size property, since Language is not used in this plugin
  set.addComponentProperty('Size', { type: 'VARIANT', defaultValue: '128px' });

  for (const child of set.children) {
    if (child.type !== 'COMPONENT') continue;
    // Try to extract size from the name
    const parts = child.name.split('-');
    if (parts.length >= 3) {
      const size = parts[2] || '128px';
      try {
        child.setProperties({ Size: size });
      } catch (e) {}
    }
    // Optionally, rename child to a generic name
    child.name = 'Variant';
  }

  // Auto layout for the set
  set.layoutMode = 'VERTICAL';
  set.primaryAxisAlignItems = 'CENTER';
  set.counterAxisAlignItems = 'CENTER';
  set.paddingLeft = 0;
  set.paddingRight = 0;
  set.paddingTop = 0;
  set.paddingBottom = 0;
  set.itemSpacing = 40;
  set.primaryAxisSizingMode = 'AUTO';
  set.counterAxisSizingMode = 'AUTO';

  figma.currentPage.selection = [set];
  figma.viewport.scrollAndZoomIntoView([set]);
  figma.notify('Combined as variants!');
}

// New functionality: Create variants from provided data
async function createVariants(data) {
  const spacing = 64; // Space between Component Sets
  // Find the rightmost existing component set to start xOffset
  const existingSets = figma.currentPage.children.filter(node => node.type === 'COMPONENT_SET');
  let xOffset = 0;
  if (existingSets.length > 0) {
    xOffset = Math.max(...existingSets.map(set => set.x + set.width)) + spacing;
  }

  const textTypes = ['headlines', 'subheadlines', 'disclaimers']; // Process all text types

  // Collect all existing set names once
  const existingSetNames = new Set(existingSets.map(set => set.name));

  for (const textType of textTypes) {
    const textItems = data[textType]; // Get text items for the current type
    if (!textItems || textItems.length === 0) {
      continue; // Skip if no text items for this type
    }
    for (const textItem of textItems) {
      const setName = `${textItem} Component Set (${textType.slice(0, -1)})`;
      if (existingSetNames.has(setName)) {
        figma.notify(`Skipped duplicate: ${setName}`);
        continue; // Skip creating duplicate set
      }

      const components = [];

      for (const fontSize of data.fontSizes[textType.slice(0, -1)]) { // Use font sizes specific to the text type
        const component = figma.createComponent();
        component.name = `${fontSize}px`;

        // Create text node
        const textNode = figma.createText();
        const fontName = await getFontForTextType(textType.slice(0, -1)); // Dynamically get font for text type
        await figma.loadFontAsync(fontName);

        textNode.fontName = fontName;
        textNode.fontSize = fontSize;
        textNode.characters = textItem;

        // Set text alignment to left
        textNode.textAlignHorizontal = 'LEFT';
        textNode.textAlignVertical = 'TOP';

        // Set text layer to "fill container"
        textNode.layoutAlign = 'STRETCH';
        textNode.textAutoResize = 'HEIGHT';

        // Set line height to 100%
        textNode.lineHeight = { unit: 'PERCENT', value: 100 };
        textNode.letterSpacing = { unit: 'PERCENT', value: -2 };

        // Append text node to component
        component.appendChild(textNode);

        // Enable auto layout
        component.layoutMode = 'VERTICAL';
        component.primaryAxisAlignItems = 'MIN'; // Align items to the left
        component.counterAxisAlignItems = 'MIN'; // Align items to the top
        component.paddingLeft = 0;
        component.paddingRight = 0;
        component.paddingTop = 0;
        component.paddingBottom = 0;
        component.itemSpacing = 0;

        // Set resizing to "Hug contents" for both width and height
        component.primaryAxisSizingMode = 'AUTO'; // Hug contents horizontally
        component.counterAxisSizingMode = 'AUTO'; // Hug contents vertically

        components.push(component);
      }

      if (components.length > 0) {
        const set = figma.combineAsVariants(components, figma.currentPage);
        set.name = setName;

        // Add a shared TEXT property on the set and bind all variant text layers to it
        let textPropName;
        try {
          textPropName = set.addComponentProperty('Text', 'TEXT', textItem);
        } catch (e) {
          // If property already exists, reuse existing one
          const defs = set.componentPropertyDefinitions || {};
          const entry = Object.entries(defs).find(([, def]) => def.type === 'TEXT');
          textPropName = entry ? entry[0] : undefined;
        }
        if (textPropName) {
          for (const variant of set.children) {
            if (variant.type !== 'COMPONENT') continue;
            const textNodes = variant.findAll(n => n.type === 'TEXT');
            for (const tn of textNodes) {
              const refs = tn.componentPropertyReferences || {};
              refs.characters = textPropName;
              tn.componentPropertyReferences = refs;
            }
          }
        }

        // Enable auto layout for the set
        set.layoutMode = 'VERTICAL';
        set.primaryAxisAlignItems = 'MIN'; // Align items to the left
        set.counterAxisAlignItems = 'MIN'; // Align items to the top
        set.paddingLeft = 0;
        set.paddingRight = 0;
        set.paddingTop = 0;
        set.paddingBottom = 0;
        set.itemSpacing = 40;

        // Set resizing to "Hug contents" for both width and height
        set.primaryAxisSizingMode = 'AUTO'; // Hug contents horizontally
        set.counterAxisSizingMode = 'AUTO'; // Hug contents vertically

        // Position the Component Set to prevent overlapping
        set.x = xOffset; // Position horizontally with spacing
        set.y = 0; // Keep all Component Sets aligned vertically

        xOffset += set.width + spacing; // Update xOffset for the next Component Set

        figma.currentPage.selection = [set];
        figma.viewport.scrollAndZoomIntoView([set]);
      }
    }
  }

  figma.notify('Created variants successfully!');
}

figma.ui.onmessage = async function (msg) {
  try {
    if (msg.type === 'create-variants') {
      await createVariants(msg.data); // Ensure this matches the function name
    } else if (msg.type === 'combine-variants') {
      await combineSelectedAsVariants();
    }
  } catch (error) {
    console.error('Error handling message:', error);
    figma.notify('An error occurred. Check the console for details.');
  }
};