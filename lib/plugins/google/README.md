# Google Cloud Functions (Alpha)

This plugin enables Google CloudFunctions support within the Serverless Framework.

## Getting started

This guide will help you setup a Google Cloud Project (required) and your first Google Cloud Functions.

### Create a Serverless Service with Google as the Provider

Google support for the `create` command is coming soon.  Until then, follow these steps:

1. Run `serverless install --url https://github.com/serverless/boilerplate-googlecloudfunctions-nodejs`.
2. Rename your service.  Make sure the name does not include "google" or "goog".

### Set up Google Cloud Platform

#### Verify your Google Cloud Account is whitelisted

At the moment, Google Cloud Functions is in private beta.  You can verify you're whitelisted for the Google Cloud Functions beta by checking if you can access the <a href="https://console.cloud.google.com/functions" target="_blank">Google Cloud Functions Console</a>.

#### Create a Google Cloud Billing Account

You need a Billing Account with a credit card attached to use Google Cloud Functions.  Here's how to create one:

1. <a href="https://console.cloud.google.com/billing/create" target="_blank">Click here</a>, to go to the screen to create a new Billing Account.
2. Enter the name of the Billing Account and enter your billing information.  Then click Submit to enable billing.
3. A Billing Account will exist already offering you a free trial.  Please note that this will not work for Google Cloud Functions.  Only a Billing Account with a valid credit card will work.

If necessary, a more detailed guide on creating a Billing Account can be found <a href="https://support.google.com/cloud/answer/6288653?hl=en" target="_blank">here</a>.

#### Create a new Google Cloud Project

A Google Cloud Project is required to use Google Cloud Functions.  Here's how to create one:

1. Go to the <a href="https://console.cloud.google.com" target="_blank">Google Cloud Console Console</a>.
2. There is a dropdown near the top left of the screen (near the search bar that lists your projects).  Click it and select "Create Project".
3. Enter a Project name and select the Billing Account you created in the steps above (or any Billing Account with a valid credit card attached).
3. Click on "Create" to start the creation process.
4. Wait until the Project was successfully created and Google will redirect you to your new Project.
5. Verify your currently within your new Project by looking at the dropdown next to the search bar.  This should mark your new Project as selected.

#### Enable the Google Cloud Functions API

You need to enable the Google Cloud Functions API so that you can use Google Cloud Functions
for your projects.

1. Go to the <a href="https://console.cloud.google.com" target="_blank">Google Cloud Console Console</a>.
2. Click on "Enable API".

#### Get credentials

You need to create credentials Serverless can use to create resources in your Project.

1. Go to the <a href="https://console.cloud.google.com/apis" target="_blank">Google Cloud API Manager</a> and select "Credentials" on the left.
2. Click on "Create credentials" and select "Service account key".
3. Select "New service account" in the "Service account" dropdown.
4. Enter a name for your "Service account name" (e.g. "serverless-framework").
5. Select "Project" --> "Owner" as the "Role".
6. The "Key type" should be "JSON".
7. Click on "Create" to create your private key.
8. That's your so called `keyfile` which should be downloaded on your machine.
9. Save the `keyfile` somewhere secure.  We recommend making a folder in your root folder and putting it there.  Like this, `~/.gcloud/keyfile.json`.  You can change the file name from `keyfile` to anything.  Remember the path you saved it to.

### Update the `provider` config in `serverless.yml`

Open up your `serverless.yml` file and update the `provider` section with your Google Cloud Project id and
the path to your `keyfile.json` file. It should look something like this:

```yml
provider:
  name: google
  runtime: nodejs4.3
  project: my-serverless-project-1234
  credentials: ~/.gcloud/keyfile.json
```

### Deploy

Run `serverless deploy` to deploy your service to the Google Cloud.

## Workflow

1. Deploy the service with `serverless deploy`
2. Invoke a function with `serverless invoke -f hello`
3. View the function logs with `serverless logs -f hello`
4. See information about the service with `serverless info`
5. Remove the service with `serverless remove`
