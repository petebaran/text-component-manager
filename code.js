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
      fontName = { family: 'Gilroy', style: 'SemiBold' };
      break;
    case 'subheadline':
      fontName = { family: 'Inter', style: 'Medium' };
      break;
    case 'disclaimer':
      fontName = { family: 'Inter', style: 'Regular' };
      break;
    default:
      fontName = { family: 'Inter', style: 'Regular' };
  }
  
  try {
    await figma.loadFontAsync(fontName);
    return fontName;
  } catch (error) {
    // Fallback to Inter Regular if custom font fails
    console.warn(`Failed to load font ${fontName.family} ${fontName.style}, falling back to Inter Regular`);
    const fallbackFont = { family: 'Inter', style: 'Regular' };
    await figma.loadFontAsync(fallbackFont);
    return fallbackFont;
  }
}

async function createTextComponents(data, asVariants = false) {
  const components = [];
  let xOffset = 0;
  let yOffset = 0;

  for (const langCode of Object.keys(data.languages)) {
    const content = data.languages[langCode];
    if (!content.trim()) continue;

    for (const fontSize of data.fontSizes) {
      const component = figma.createComponent();

      if (asVariants) {
        component.name = `${data.type}-${langCode}-${fontSize}px`;
      } else {
        component.name = `${data.type}/${langCode}/${fontSize}px`;
      }

      // Get correct font for text type
      const fontName = await getFontForTextType(data.type);

      // Create text node
      const textNode = figma.createText();
      textNode.fontName = fontName;
      textNode.fontSize = fontSize;
      textNode.characters = content;

      // Set line height to 100%
      textNode.lineHeight = { unit: "PERCENT", value: 100 };

      // Make text fill container in auto layout
      textNode.layoutAlign = "STRETCH";
      textNode.textAutoResize = "HEIGHT";

      // Append text node first, then enable auto layout
      component.appendChild(textNode);

      // Enable auto layout on the component
      component.layoutMode = 'VERTICAL';
      component.primaryAxisAlignItems = 'CENTER';
      component.counterAxisAlignItems = 'CENTER';
      component.paddingLeft = 0;
      component.paddingRight = 0;
      component.paddingTop = 0;
      component.paddingBottom = 0;
      component.itemSpacing = 0;

      // Set resizing to "Hug contents" for both width and height
      component.primaryAxisSizingMode = 'AUTO';   // Hug contents horizontally
      component.counterAxisSizingMode = 'AUTO';   // Hug contents vertically

      // Do not manually resize the component, let auto layout handle it

      // Position components so they don't overlap (optional, for initial placement)
      component.x = xOffset;
      component.y = yOffset;

      xOffset += component.width + 50;
      if (xOffset > 1200) {
        xOffset = 0;
        yOffset += 150;
      }

      components.push(component);
    }
  }

  if (asVariants && components.length > 0) {
    const set = figma.combineAsVariants(components, figma.currentPage);
    set.name = `${data.type.charAt(0).toUpperCase() + data.type.slice(1)} Component Set`;

    // Enable vertical auto layout and hug contents
    set.layoutMode = 'VERTICAL';
    set.primaryAxisAlignItems = 'LEFT';
    set.counterAxisAlignItems = 'CENTER';
    set.paddingLeft = 0;
    set.paddingRight = 0;
    set.paddingTop = 0;
    set.paddingBottom = 0;
    set.itemSpacing = 40;

    // Make the set "hug contents" in both directions
    set.primaryAxisSizingMode = 'AUTO';   // Hug contents horizontally
    set.counterAxisSizingMode = 'AUTO';   // Hug contents vertically

    // Ensure all children (components) also hug contents
    for (const child of set.children) {
      if ("primaryAxisSizingMode" in child) child.primaryAxisSizingMode = 'AUTO';
      if ("counterAxisSizingMode" in child) child.counterAxisSizingMode = 'AUTO';
    }

    // DO NOT manually resize the set!

    // Force Figma to recalculate the width by resizing to 1, then letting auto layout take over
    set.resizeWithoutConstraints(1, set.height);

    try {
      set.addComponentProperty('Language', { type: 'TEXT', defaultValue: 'EN' });
      set.addComponentProperty('Size', { type: 'TEXT', defaultValue: '48px' });
      for (let v = 0; v < set.children.length; v++) {
        const child = set.children[v];
        if (child.type !== 'COMPONENT') continue;
        const parts = child.name.split('-');
        if (parts.length >= 3) {
          const language = parts[1] || 'EN';
          const size = parts[2] || '48px';
          try { 
            child.setProperties({ Language: language, Size: size }); 
          } catch (e) {}
        }
      }
    } catch (e) {
      console.error('Error setting up component properties:', e);
    }
    figma.currentPage.selection = [set];
    figma.viewport.scrollAndZoomIntoView([set]);
    return [set];
  }

  return components;
}

// Helper function to get default text content for text properties
function getDefaultTextContent(textType) {
  switch (textType) {
    case 'headline':
      return 'Your Headline Here';
    case 'subheadline':
      return 'Your Subheadline Here';
    case 'disclaimer':
      return 'Your Disclaimer Text Here';
    default:
      return 'Default Text';
  }
}

async function updateSelectedComponents(data) {
  const selection = figma.currentPage.selection;
  
  if (selection.length === 0) {
    figma.notify('Select some components or component sets to update first.');
    return 0;
  }

  let updatedCount = 0;

  for (const node of selection) {
    if (node.type === 'COMPONENT_SET') {
      // Update all variants in the component set
      if (node.name.toLowerCase().includes(data.type.toLowerCase())) {
        for (const child of node.children) {
          if (child.type === 'COMPONENT') {
            const updated = await updateSingleComponent(child, data);
            if (updated) updatedCount++;
          }
        }
      }
    } else if (node.type === 'COMPONENT') {
      // For individual components, try updating regardless of naming pattern
      // The updateSingleComponent function will handle the logic
      const updated = await updateSingleComponent(node, data);
      if (updated) updatedCount++;
    }
  }

  if (updatedCount === 0) {
    figma.notify(`No matching ${data.type} components found in selection.`);
  }

  return updatedCount;
}

async function updateSingleComponent(component, data) {
  let nameParts, type, langCode, sizeStr;
  
  // Try both naming patterns to be flexible
  if (component.name.includes('-')) {
    // Handle variant components (type-lang-size)
    nameParts = component.name.split('-');
    if (nameParts.length >= 3) {
      [type, langCode, sizeStr] = nameParts;
    }
  } else if (component.name.includes('/')) {
    // Handle individual components (type/lang/size)
    nameParts = component.name.split('/');
    if (nameParts.length === 3) {
      [type, langCode, sizeStr] = nameParts;
    }
  }
  
  // If we couldn't parse the name, return false
  if (!type || !langCode || !sizeStr) {
    return false;
  }
  
  // Check if this component matches our current text type
  if (type !== data.type) {
    return false;
  }
  
  const fontSize = parseInt(sizeStr.replace('px', ''));
  
  // Check if we have content for this language and size
  if (data.languages[langCode] && data.fontSizes.includes(fontSize)) {
    const textNode = component.findOne(node => node.type === 'TEXT');
    if (textNode) {
      // Get correct font for text type using same helper function
      const fontName = await getFontForTextType(data.type);
      
      // Set font first, before setting characters
      textNode.fontName = fontName;
      textNode.fontSize = fontSize;
      textNode.characters = data.languages[langCode];
      
      // Resize component
      const padding = 20;
      component.resize(
        Math.max(textNode.width + padding * 2, 100),
        Math.max(textNode.height + padding * 2, 40)
      );
      
      // Center text
      textNode.x = (component.width - textNode.width) / 2;
      textNode.y = (component.height - textNode.height) / 2;
      
      return true;
    }
  }
  
  return false;
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

  // Optionally, add variant properties based on component names
  // Example: If names are "headline-EN-128px", "headline-DE-128px", etc.
  set.addComponentProperty('Language', { type: 'VARIANT', defaultValue: 'EN' });
  set.addComponentProperty('Size', { type: 'VARIANT', defaultValue: '128px' });

  for (const child of set.children) {
    if (child.type !== 'COMPONENT') continue;
    // Try to extract language and size from the name
    const parts = child.name.split('-');
    if (parts.length >= 3) {
      const language = parts[1] || 'EN';
      const size = parts[2] || '128px';
      try {
        child.setProperties({ Language: language, Size: size });
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
  let xOffset = 0; // Horizontal offset for positioning Component Sets
  const spacing = 64; // Space between Component Sets

  for (const headline of data.headlines) {
    const components = [];

    for (const fontSize of data.fontSizes) {
      const component = figma.createComponent();
      component.name = `${headline}-${fontSize}px`;

      // Create text node
      const textNode = figma.createText();
      const fontName = await getFontForTextType('headline'); // Assuming headline type
      await figma.loadFontAsync(fontName);

      textNode.fontName = fontName;
      textNode.fontSize = fontSize;
      textNode.characters = headline;

      // Set text alignment to left
      textNode.textAlignHorizontal = 'LEFT';
      textNode.textAlignVertical = 'TOP';

      // Set text layer to "fill container"
      textNode.layoutAlign = 'STRETCH';
      textNode.textAutoResize = 'HEIGHT';

      // Set line height to 100%
      textNode.lineHeight = { unit: 'PERCENT', value: 100 };

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
      set.name = `${headline} Component Set`;

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

      // Update xOffset for the next Component Set
      xOffset += set.width + spacing;

      figma.currentPage.selection = [set];
      figma.viewport.scrollAndZoomIntoView([set]);
    }
  }

  figma.notify('Created variants successfully!');
}

figma.ui.onmessage = async function (msg) {
  try {
    if (msg.type === 'create-variants') {
      await createVariants(msg.data); // Ensure this matches the function name
    } else if (msg.type === 'create-components') {
      await createTextComponents(msg.data);
    } else if (msg.type === 'update-components') {
      await updateSelectedComponents(msg.data);
    } else if (msg.type === 'combine-variants') {
      await combineSelectedAsVariants();
    }
  } catch (error) {
    console.error('Error handling message:', error);
    figma.notify('An error occurred. Check the console for details.');
  }
};