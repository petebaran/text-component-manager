// code.js
figma.showUI(__html__, { 
  width: 400, 
  height: 600,
  themeColors: true 
});

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
        // Use the EXACT naming pattern that works in Risk Warning plugin
        component.name = `${data.type}-${langCode}-${fontSize}px`;
      } else {
        component.name = `${data.type}/${langCode}/${fontSize}px`;
      }
      
      // Load font
      await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
      
      // Create text node
      const textNode = figma.createText();
      textNode.characters = content;
      textNode.fontSize = fontSize;
      textNode.fontName = { family: 'Inter', style: 'Regular' };
      
      component.appendChild(textNode);
      
      // Resize component to fit text with padding
      const padding = 20;
      component.resize(
        Math.max(textNode.width + padding * 2, 100),
        Math.max(textNode.height + padding * 2, 40)
      );
      
      // Center text
      textNode.x = (component.width - textNode.width) / 2;
      textNode.y = (component.height - textNode.height) / 2;
      
      // Position components so they don't overlap
      component.x = xOffset;
      component.y = yOffset;
      
      // Move position for next component
      xOffset += component.width + 50; // 50px gap between components
      if (xOffset > 1200) { // Start new row after ~1200px
        xOffset = 0;
        yOffset += 150; // Move to next row
      }
      
      components.push(component);
    }
  }
  
  if (asVariants && components.length > 0) {
    // Select all components for easy variant creation
    figma.currentPage.selection = components;
    figma.viewport.scrollAndZoomIntoView(components);
  }
  
  return components;
}

async function updateSelectedComponents(data) {
  const selectedComponents = figma.currentPage.selection.filter(node => 
    node.type === 'COMPONENT' && 
    node.name.startsWith(`${data.type}/`)
  );

  if (selectedComponents.length === 0) {
    figma.notify('Select some components to update first.');
    return 0;
  }

  let updatedCount = 0;

  for (const component of selectedComponents) {
    const nameParts = component.name.split('/');
    if (nameParts.length === 3) {
      const [type, langCode, sizeStr] = nameParts;
      const fontSize = parseInt(sizeStr.replace('px', ''));
      
      if (data.languages[langCode] && data.fontSizes.includes(fontSize)) {
        const textNode = component.findOne(node => node.type === 'TEXT');
        if (textNode) {
          // Get correct font for text type using same helper function
          const fontName = await getFontForTextType(data.type);
          
          textNode.characters = data.languages[langCode];
          textNode.fontSize = fontSize;
          textNode.fontName = fontName;
          
          // Resize component
          const padding = 20;
          component.resize(
            Math.max(textNode.width + padding * 2, 100),
            Math.max(textNode.height + padding * 2, 40)
          );
          
          // Center text
          textNode.x = (component.width - textNode.width) / 2;
          textNode.y = (component.height - textNode.height) / 2;
          
          updatedCount++;
        }
      }
    }
  }

  return updatedCount;
}

// This is the EXACT function from the working Risk Warning plugin
function combineAsVariants() {
  const comps = figma.currentPage.selection.filter(function (n) { 
    return n.type === 'COMPONENT'; 
  });
  
  if (comps.length < 2) { 
    figma.notify('Select 2+ components to combine.'); 
    return; 
  }
  
  const set = figma.combineAsVariants(comps, figma.currentPage);
  set.name = 'Text Component Set';
  
  try {
    // Add component properties
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
  } catch (e) {}
  
  figma.currentPage.selection = [set];
  figma.viewport.scrollAndZoomIntoView([set]);
  figma.notify('Combined ' + comps.length + ' components as variants!');
}

figma.ui.onmessage = async function(msg) {
  try {
    switch (msg.type) {
      case 'create-components':
        const components = await createTextComponents(msg.data, false);
        figma.ui.postMessage({
          type: 'success',
          message: `Created ${components.length} individual components!`
        });
        break;

      case 'create-variants':
        const variantComponents = await createTextComponents(msg.data, true);
        figma.ui.postMessage({
          type: 'success',
          message: `Created ${variantComponents.length} components ready for variants. Click "Combine as Variants" next.`
        });
        break;

      case 'combine-variants':
        combineAsVariants();
        break;

      case 'update-components':
        const updatedCount = await updateSelectedComponents(msg.data);
        figma.ui.postMessage({
          type: 'success',
          message: `Updated ${updatedCount} selected components!`
        });
        break;
        
      default:
        break;
    }
  } catch (error) {
    figma.ui.postMessage({
      type: 'error',
      message: `Error: ${error.message}`
    });
  }
};