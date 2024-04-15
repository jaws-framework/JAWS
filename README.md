[![Serverless Framework AWS Lambda AWS DynamoDB AWS API Gateway](https://github.com/serverless/serverless/assets/2752551/b20dd7e5-0380-492f-9cf2-5fd87a145ebb)](https://serverless.com)

<br/>

<div align="center">
  <a aria-label="Serverless.com" href="https://serverless.com">Website</a>
  &nbsp;•&nbsp;
  <a aria-label="Serverless Framework Documentation" href="https://serverless.com/framework/docs/">Documentation</a>
  &nbsp;•&nbsp;
  <a aria-label="Serverless Inc Twitter" href="https://twitter.com/goserverless">X / Twitter</a>
  &nbsp;•&nbsp;
  <a aria-label="Serverless Framework Community Slack" href="https://serverless.com/slack">Community Slack</a>
  &nbsp;•&nbsp;
  <a aria-label="Serverless Framework Community Forum" href="https://forum.serverless.com">Forum</a>
</div>

<br/>
<br/>

**The Serverless Framework** – Makes it easy to use AWS Lambda and other managed cloud services to build applications that auto-scale, cost nothing when idle, and boast radically low maintenance.

The Serverless Framework is a command-line tool with approachable YAML syntax to deploy both your code and cloud infrastructure needed to make tons of serverless application use-cases, like APIs, front-ends, data pipelines and scheduled tasks. It's a multi-language framework that supports Node.js, Typescript, Python, Go, Java, and more. It's also completely extensible via over 1,000 plugins which add more serverless use-cases and workflows to the Framework.

Actively maintained by [Serverless Inc](https://www.serverless.com).

<br/>

# Serverless Framework - V.4 - Alpha

**March 13th, 2024** – We're continuing to add features to the V.4 Alpha for early feedback from the community and plug-in authors. Here's a list of everything that's new in V.4 so far:

- **No Breaking Changes:** No breaking changes for the "aws" Provider.
- **New AWS Lambda Runtimes:** "python3.12", "dotnet8", and "java21".
- **Support Command:** Send support requests to our team directly from the CLI, which auto-include contextual info which you can review before sending.
- **New Local Development Experience:** Route events from AWS to your local AWS Lambda code to develop faster without having to deploy every change.
- **Debug Summary for AI:** When you run into a bug, you can run "serverless support --ai" to generate a concise report detailing your last bug with all necessary context, optimized for pasting into AI tools such as ChatGPT.
- **Advanced Logging Controls for AWS Lambda:** Capture Logs in JSON, increased log granularity, and setting a custom Log Group. Here is the [AWS article](https://aws.amazon.com/blogs/compute/introducing-advanced-logging-controls-for-aws-lambda-functions/). Here is the [YAML implementation](https://github.com/serverless/serverless/blob/v4.0/docs/providers/aws/guide/serverless.yml.md#logs)
- **AWS SSO:** Environment variables, especially ones set by AWS SSO, are prioritized. The Framework and Dashboard no longer interfere with these.
- **Build Plugins Run First:** [Build plugins now run first](https://github.com/serverless/serverless/issues?q=build+plugin), if they include the optional tags static property containing a `"build"` tag run first.
- **Binary By Default:** We've transitioned to a binary core by default, making Node.js not a requirement.
- **Automatic Updates:** These happen by default now. Though, you will be able to control the level of updates you're open to.
- **Improved Onboarding & Set-Up:** The `serverless` command has been re-written to be more helpful when setting up a new or existing project.
- **Updated Custom Resource Handlers:** All custom resource handlers now use `nodejs20.x`.
- **Deprecation Of Non-AWS Providers:** Deprecation of other cloud providers, in favor of handling this better in our upcoming Serverless Framework "Extensions".

**Breaking Plugin Changes**
Some Plug-Ins are affected by changes in V.4. The purpose of the "Alpha" is to discover these issues and fix them before V.4 is GA. Here are the known issues:

• **serverless-better-credentials:** Credential handling has been reworked in V.4 to better support AWS SSO out-of-the-box, but this has broken this plugin at the moment.

Serverless Framework V.4 Beta will be released shortly w/ additional features. Follow our progress in the [Github Milestones](https://github.com/serverless/serverless/milestones). Please use the ["v4" tag](https://github.com/serverless/serverless/labels/V4) when creating issues for this Alpha.

For information on upgrading from V.3 to V.4, check out the ["Upgrading to V.4 Guide"](./docs/guides/upgrading-v4.md).

<br/>

# Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Plugins](https://github.com/serverless/plugins)
- [Community](#community)

<br/>

# <a name="features"></a>Features

- **Build More, Manage Less:** Innovate faster by spending less time on infrastructure management.
- **Maximum Versatility:** Tackle diverse serverless use cases, from APIs and scheduled tasks to web sockets and data pipelines.
- **Automated Deployment:** Streamline development with code and infrastructure deployment handled together.
- **Local Development:** Route events from AWS to your local AWS Lambda code to develop faster without having to deploy every change.
- **Ease of Use:** Deploy complex applications without deep cloud infrastructure expertise, thanks to simple YAML configuration.
- **Language Agnostic:** Build in your preferred language – Node.js, Python, Java, Go, C#, Ruby, Swift, Kotlin, PHP, Scala, or F#.
- **Complete Lifecycle Management:** Develop, deploy, monitor, update, and troubleshoot serverless applications with ease.
- **Scalable Organization:** Structure large projects and teams efficiently by breaking down large apps into Services to work on individually or together via Serverless Compose.
- **Effortless Environments:** Seamlessly manage development, staging, and production environments.
- **Customization Ready:** Extend and modify the Framework's functionality with a rich plugin ecosystem.
- **Vibrant Community:** Get support and connect with a passionate community of Serverless developers.

<br/>

# <a name="quick-start"></a>Quick Start

The Serverless Framework is packaged as a binary, which can be installed via this CURL script.

```bash
curl -o- -L https://install.serverless.com | bash
```

You can also install the Framework via NPM. It's currently under the temporary namespace of `v4` while in Alpha. You will need to have [Node.js](https://nodejs.org) installed.

```bash
npm i @serverless/v4 -g
```

Serverless Framework now auto-updates. It checks once daily. If you want to force an update, use this environment variable: `SERVERLESS_FRAMEWORK_FORCE_UPDATE=true`

<br/>

## Create A Project

Run the interactive onboarding via the "serverless" command, to pick a Template and set-up credentials for AWS.

```bash
serverless
```

During onboarding, you can set up AWS credentials a few ways. You can simply add them as environment variables, which is best if you're using AWS SSO. You can have the Serverless Framework Platform store an AWS IAM Role for you and your team to share and assign to specific Stages, or you can persist long-term credentials to an AWS Profile on your local machine. We recommend the first two options.

After onboarding, move into the newly created directory.

```
cd [your-new-project-name]
```

Your new project will contain a `serverless.yml` file with simple syntax for deploying infrastructure to AWS, such as AWS Lambda functions, infrastructure that triggers those functions with events, and additional infrastructure your AWS Lambda functions may need for various use-cases. Learn more about this in the [Core Concepts documentation](https://www.serverless.com/framework/docs/providers/aws/guide/intro).

<br/>

## Develop Locally

Run the dev command to start developing with real AWS events and infrastructure. This will run an initial deployment of your project infrastructure to AWS and display essential information, such as API Endpoint URLs, in your terminal.

Note, you can use `serverless` or `sls` as the command prompt.

```bash
sls dev
```

Whenever any of your Lambda functions are invoked on AWS while a development session is active, your function code will be executed locally instead of on AWS Lambda, within an environment that closely resembles AWS Lambda. Your local code will have access to the same environment variables available in your Lambda functions and will have the same IAM permissions as your Lambda function.

All logs or errors will be displayed in your local terminal, and the response will be returned to the caller as expected. This significantly accelerates the testing process for changes while still utilizing real AWS infrastructure with minimal emulation.

To exit the development session, simply press Ctrl+C. This will disconnect your local machine from AWS Lambda, and any subsequent invocations will timeout until you deploy your changes (see below).

More details on dev mode can be found [here](https://www.serverless.com/framework/docs/providers/aws/guide/developing).

## Deploy Changes

Run the `deploy` command to deploy your project to AWS and persist the changes you made in your development session.

```bash
sls deploy
```

More details on deploying can be found [here](https://www.serverless.com/framework/docs/providers/aws/guide/deploying).

<br/>

## Use Plugins

A big benefit of Serverless Framework is within its [Plugin ecosystem](https://serverless.com/plugins).

Plugins extend or overwrite the Serverless Framework, giving it new use-cases or capabilites, and there are hundreds of them.

Some of the most common Plugins are:

- **[Serverless ESBuild](https://github.com/floydspace/serverless-esbuild)** - Bundles JavaScript and TypeScript extremely fast via esbuild.
- **[Serverless Domain Manager](https://github.com/amplify-education/serverless-domain-manager)** - Manage custom domains with AWS API Gateways.
- **[Serverless Step Functions](https://github.com/serverless-operations/serverless-step-functions)** - Build AWS Step Functions architectures.
- **[Serverless Python Requirements](https://github.com/serverless/serverless-python-requirements)** - Bundle dependencies from requirements.txt and make them available in your PYTHONPATH.

<br/>

## Composing Services

Serverless Framework Compose allows you to work with multiple Serverless Framework Services at once, and do the following...

- Deploy multiple services in parallel
- Deploy services in a specific order
- Share outputs from one service to another
- Run commands across multiple services

Here is what a project structure might look like:

```bash
my-app/
  service-a/
    src/
      ...
    serverless.yml
  service-b/
    src/
      ...
    serverless.yml
```

Using Serverless Framework Compose requires a `serverless-compose.yml` file. In it, you specify which Services you wish to deploy. You can also share data from one Service to another, which also creates a deployment order.

```yaml
# serverless-compose.yml

services:
  service-a:
    path: service-a

  service-b:
    path: service-b
    params:
      queueUrl: ${service-a.queueUrl}
```

Currently, outputs to be inherited by another Service must be AWS Cloudformation Outputs.

```yaml
# service-a/serverless.yml

# ...

resources:
  Resources:
    MyQueue:
      Type: AWS::SQS::Queue
      # ...
  Outputs:
    queueUrl:
      Value: !Ref MyQueue
```

The value will be passed to `service-b` [as a parameter](https://www.serverless.com/framework/docs/guides/parameters) named `queueUrl`. Parameters can be referenced in Serverless Framework configuration via the `${param:xxx}` syntax:

```yaml
# service-b/serverless.yml

provider:
  ...
  environment:
    # Here we inject the queue URL as a Lambda environment variable
    SERVICE_A_QUEUE_URL: ${param:queueUrl}
```

More details on Serverless Framework Compose can be found [here](https://www.serverless.com/framework/docs/guides/compose).

<br/>

## Support Command

In Serverless Framework V.4, we've introduced the `serverless support` command, a standout feature that lets you generate issue reports, or directly connect with our support team. It automatically includes relevant context and omits sensitive details like secrets and account information, which you can check before submission. This streamlined process ensures your issues are quickly and securely addressed.

To use this feature, after an error or any command, run:

```bash
sls support
```

After each command, whether it succeeded or not, the context is saved within your current working directory in the `.serverless` folder.

To open a new support ticket, run the `sls support` command and select `Get priority support...`. Optionally you'll be able to review and edit the generated report. Opening support tickets is only available to users who sign up for a Subscription.

You can also generate reports without submitting a new support ticket. This is useful for sharing context with others, opening Github issues, or using it with an AI prompt like ChatGPT. To do this, run the `sls support` command and select `Create a summary report...`, or `Create a comprehensive report..`. You can skip the prompt by running `sls support --summary` or `sls support --all`. This is especially useful for capturing the report into the clipboard (e.g. `sls support --summary | pbcopy`).

<br/>

## Remove Your Service

If you want to delete your service, run `remove`. This will delete all the AWS resources created by your project and ensure that you don't incur any unexpected charges. It will also remove the service from Serverless Dashboard.

```bash
sls remove
```

More details on the `remove` command can be found [here](https://www.serverless.com/framework/docs/providers/aws/cli-reference/remove).

<br/>

## What's Next

Here are some helpful resources for continuing with the Serverless Framework:

- [Study Serverless Framework's core concepts](https://www.serverless.com/framework/docs/providers/aws/guide/intro)
- [Get inspiration from these Serverless Framework templates](https://github.com/serverless/examples)
- [Discover all of the events that can trigger Lambda functions](https://www.serverless.com/framework/docs/providers/aws/guide/events)
- [Bookmark Serverless Framework's `serverless.yml` guide](https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml)
- [Search the plugins registry to extend Serverless Framework](https://www.serverless.com/plugins)

<br/>

# <a name="community"></a>Community

- [X / Twitter](https://twitter.com/goserverless)
- [Community Slack](https://serverless.com/slack)
- [Serverless Meetups](http://www.meetup.com/serverless/)
- [Stackoverflow](http://stackoverflow.com/questions/tagged/serverless-framework)
- [Facebook](https://www.facebook.com/serverless)
- [Contact Us](mailto:hello@serverless.com)
