const { Client } = require('@notionhq/client');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

// Load screen-to-API mapping
function loadMapping() {
  const mappingPath = path.join(process.cwd(), 'screen-api-mapping.json');
  if (!fs.existsSync(mappingPath)) {
    console.error('screen-api-mapping.json not found');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
}

// Load and cache OpenAPI specs
function loadSpecs() {
  const specs = {};
  const specFiles = ['api/openapi.yaml', 'in-game/openapi.yaml', 'steam/openapi.yaml'];

  for (const file of specFiles) {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      specs[file] = yaml.load(fs.readFileSync(fullPath, 'utf8'));
    }
  }
  return specs;
}

async function findPageByScreen(screenName) {
  const response = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      property: 'Screen',
      select: {
        equals: screenName,
      },
    },
  });

  // Find the API spec page (not the main screen spec)
  for (const page of response.results) {
    const title = page.properties.Name?.title?.[0]?.plain_text || '';
    if (title.includes('API')) {
      return page.id;
    }
  }

  return null;
}

async function createPage(screenName, pageName) {
  const newPage = await notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: {
      Name: {
        title: [{ text: { content: pageName } }],
      },
      Screen: {
        select: { name: screenName },
      },
      Status: {
        select: { name: 'Approved' },
      },
      'API Endpoint': {
        url: 'https://docs.mentoroid.ai',
      },
    },
  });
  return newPage.id;
}

function getEndpointDetails(specs, endpoint) {
  const spec = specs[endpoint.source];
  if (!spec || !spec.paths) return null;

  const pathData = spec.paths[endpoint.path];
  if (!pathData) return null;

  const methodData = pathData[endpoint.method.toLowerCase()];
  if (!methodData) return null;

  return {
    path: endpoint.path,
    method: endpoint.method,
    summary: methodData.summary || '',
    description: methodData.description || '',
    parameters: methodData.parameters || [],
    requestBody: methodData.requestBody,
    responses: methodData.responses || {},
    tags: methodData.tags || [],
  };
}

function generateMarkdownForScreen(screenName, screenConfig, specs) {
  let md = `# ${screenName} - API Documentation\n\n`;
  md += `${screenConfig.description}\n\n`;
  md += `---\n\n`;

  for (const endpoint of screenConfig.endpoints) {
    if (endpoint.status === 'planned') {
      md += `## ${endpoint.method} \`${endpoint.path}\`\n`;
      md += `*Status: Planned - Not yet deployed*\n\n`;
      continue;
    }

    const details = getEndpointDetails(specs, endpoint);
    if (!details) {
      md += `## ${endpoint.method} \`${endpoint.path}\`\n`;
      md += `*Endpoint not found in spec*\n\n`;
      continue;
    }

    md += `## ${details.method} \`${details.path}\`\n\n`;

    if (details.summary) {
      md += `**${details.summary}**\n\n`;
    }

    if (details.description) {
      // Clean up description (remove excessive whitespace, limit length)
      const cleanDesc = details.description
        .replace(/\n{3,}/g, '\n\n')
        .substring(0, 1000);
      md += `${cleanDesc}\n\n`;
    }

    // Parameters
    if (details.parameters && details.parameters.length > 0) {
      md += `### Parameters\n\n`;
      for (const param of details.parameters) {
        const required = param.required ? '*(required)*' : '*(optional)*';
        md += `- **${param.name}** ${required}: ${param.description || param.schema?.type || ''}\n`;
      }
      md += '\n';
    }

    // Request Body
    if (details.requestBody) {
      md += `### Request Body\n\n`;
      const content = details.requestBody.content?.['application/json'];
      if (content?.schema) {
        const props = content.schema.properties || {};
        for (const [name, prop] of Object.entries(props)) {
          const required = (content.schema.required || []).includes(name) ? '*(required)*' : '*(optional)*';
          md += `- **${name}** ${required}: ${prop.description || prop.type || ''}\n`;
        }
      }
      md += '\n';
    }

    // Responses
    if (details.responses) {
      md += `### Responses\n\n`;
      for (const [code, response] of Object.entries(details.responses)) {
        md += `- **${code}**: ${response.description || ''}\n`;
      }
      md += '\n';
    }

    md += `---\n\n`;
  }

  md += `*Last synced: ${new Date().toISOString()}*\n`;
  md += `*Source: screen-api-mapping.json*\n`;

  return md;
}

async function clearPageContent(pageId) {
  const existingBlocks = await notion.blocks.children.list({
    block_id: pageId,
    page_size: 100,
  });

  for (const block of existingBlocks.results) {
    try {
      await notion.blocks.delete({ block_id: block.id });
    } catch (e) {
      // Ignore deletion errors
    }
  }
}

function createNotionBlocks(markdown) {
  const blocks = [
    {
      object: 'block',
      type: 'callout',
      callout: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: 'Auto-synced from mentoroid-docs GitHub repository. Edit screen-api-mapping.json to update endpoint mappings.',
            },
          },
        ],
        icon: { emoji: '🔄' },
        color: 'blue_background',
      },
    },
  ];

  const lines = markdown.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;

    if (line.startsWith('# ')) {
      blocks.push({
        object: 'block',
        type: 'heading_1',
        heading_1: {
          rich_text: [{ type: 'text', text: { content: line.slice(2).trim() } }],
        },
      });
    } else if (line.startsWith('## ')) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: line.slice(3).trim() } }],
        },
      });
    } else if (line.startsWith('### ')) {
      blocks.push({
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [{ type: 'text', text: { content: line.slice(4).trim() } }],
        },
      });
    } else if (line.startsWith('- ')) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{ type: 'text', text: { content: line.slice(2).trim().substring(0, 2000) } }],
        },
      });
    } else if (line === '---') {
      blocks.push({
        object: 'block',
        type: 'divider',
        divider: {},
      });
    } else if (line.startsWith('*') && line.endsWith('*')) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{
            type: 'text',
            text: { content: line.replace(/^\*|\*$/g, '') },
            annotations: { italic: true },
          }],
        },
      });
    } else {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: line.substring(0, 2000) } }],
        },
      });
    }
  }

  return blocks;
}

async function updatePageContent(pageId, markdown) {
  await clearPageContent(pageId);

  const blocks = createNotionBlocks(markdown);

  // Batch append (max 100 blocks per request)
  for (let i = 0; i < blocks.length; i += 100) {
    await notion.blocks.children.append({
      block_id: pageId,
      children: blocks.slice(i, i + 100),
    });
  }
}

async function updateLastSynced(pageId) {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      'Last Synced': {
        date: { start: new Date().toISOString().split('T')[0] },
      },
    },
  });
}

async function syncScreen(screenName, screenConfig, specs) {
  console.log(`\nSyncing: ${screenName}`);

  // Find existing page or create new one
  let pageId = await findPageByScreen(screenName);

  if (!pageId) {
    console.log(`  Creating new page...`);
    pageId = await createPage(screenName, `${screenName} - API Specification`);
  }

  // Generate markdown content
  const markdown = generateMarkdownForScreen(screenName, screenConfig, specs);

  // Update page content
  console.log(`  Updating content...`);
  await updatePageContent(pageId, markdown);

  // Update last synced date
  await updateLastSynced(pageId);
  console.log(`  Done!`);
}

async function main() {
  if (!process.env.NOTION_API_KEY) {
    console.error('NOTION_API_KEY is not set');
    process.exit(1);
  }

  if (!DATABASE_ID) {
    console.error('NOTION_DATABASE_ID is not set');
    process.exit(1);
  }

  console.log('Loading mapping and specs...');
  const mapping = loadMapping();
  const specs = loadSpecs();

  console.log(`Loaded ${Object.keys(specs).length} spec files`);
  console.log(`Found ${Object.keys(mapping.screens).length} screen mappings`);

  // Sync each screen
  for (const [screenName, screenConfig] of Object.entries(mapping.screens)) {
    await syncScreen(screenName, screenConfig, specs);
  }

  console.log('\n✓ Notion sync complete!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
