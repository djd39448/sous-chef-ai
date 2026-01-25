import { createRepoAndPush } from '../server/github';

async function main() {
  try {
    console.log('Creating GitHub repository...');
    const result = await createRepoAndPush(
      'sous-chef-ai',
      'AI-powered kitchen assistant for meal planning, recipe generation, and smart shopping lists'
    );
    console.log('Repository created successfully!');
    console.log('URL:', result.repoUrl);
    console.log('Clone URL:', result.cloneUrl);
    console.log('Owner:', result.owner);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
