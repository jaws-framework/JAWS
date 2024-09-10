<!--
title: 'Composing Serverless Framework Services'
description: 'Learn how to deploy and orchestrate multiple services using Serverless Framework Compose. This guide covers setup, service dependencies, and global commands for efficient management of serverless applications.'
short_title: Composing Services
keywords:
  [
    'Serverless Framework',
    'composing services',
    'multiple services',
    'service dependencies',
    'global commands',
    'serverless-compose',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/compose)

<!-- DOCS-SITE-LINK:END -->

# Composing Serverless Framework services

Deploying multiple services in a monorepository is a very common pattern across larger teams. Serverless Framework Compose is meant to simplify deploying and orchestrating multiple services:

- Deploy multiple services in parallel
- Deploy services in a specific order
- Share outputs from one service to another
- Run commands across multiple services

## Setup

_Note: Compose is available in Serverless Framework **v3.15.0** or greater ([Upgrading guide](upgrading-v4.md)). If Serverless Framework is installed locally (in `node_modules/`), make sure to upgrade it as well._

Assuming you have an application containing multiple Serverless Framework services, for example:

```
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

You can create a `serverless-compose.yml` file at the root of your monorepository.

In that file, you can reference existing Serverless Framework projects by their relative paths:

```yaml
# serverless-compose.yml
services:
  service-a:
    path: service-a

  service-b:
    path: service-b
```

_Note: JS/TS configuration files are also supported (`serverless-compose.{yml,ts,js,json}`)._

## Usage

To deploy all services, instead of running `serverless deploy` in each service, you can now deploy all services at once by running `serverless deploy` at the root:

```bash
$ serverless deploy

Deploying myapp to stage dev

    ✔  service-a › deployed › 15s
    ✔  service-b › deployed › 31s

```

### Service dependencies and variables

Service variables let us:

- order deployments
- inject outputs from one service into another

This is possible via the `${service.output}` syntax. For example:

```yaml
services:
  service-a:
    path: service-a

  service-b:
    path: service-b
    params:
      queueUrl: ${service-a.queueUrl}
```

Let's break down the example above into 3 steps:

1. `${service-a.queueUrl}` will resolve to the `queueUrl` output of the `service-a` service.

   The outputs of a Serverless Framework service are resolved from its **CloudFormation outputs**. Here is how we can expose the `queueUrl` output in the `service-a/serverless.yml` config:

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

2. Because of the dependency introduced by the variable, `serverless deploy` will automatically **deploy `service-a` first, and then `service-b`.**

3. The value will be passed to `service-b` [as a parameter](parameters.md) named `queueUrl`. Parameters can be referenced in Serverless Framework configuration via the `${param:xxx}` syntax:

   ```yaml
   # service-b/serverless.yml
   provider:
     ...
     environment:
       # Here we inject the queue URL as a Lambda environment variable
       SERVICE_A_QUEUE_URL: ${param:queueUrl}
   ```

Cross-service variables are a great way to share API URLs, queue URLs, database table names, and more, without having to hardcode resource names or use SSM.

### Explicit dependencies

Alternatively, it is possible to specify **explicit dependencies** without variables via the `dependsOn` option. For example:

```yaml
services:
  service-a:
    path: service-a

  service-b:
    path: service-b
    dependsOn: service-a

  service-c:
    path: service-c

  service-d:
    path: service-d
    dependsOn:
      - service-a
      - service-c
```

As seen in the above example, it is possible to configure more than one dependency by providing `dependsOn` as a list.

### Global commands

On top of `serverless deploy`, the following commands can be run globally across all services:

- `serverless info` to view all services info
- `serverless remove` to remove all services
- `serverless print` to print all services configuration
- `serverless package` to package all services

### Service-specific commands

It is possible to run commands for a specific service only. For example to deploy only a specific service:

```bash
serverless deploy --service=service-a

# Shortcut alternative
serverless service-a deploy
```

Or tail logs of a single function:

```bash
serverless logs --service=service-a --function=index

# Shortcut alternative
serverless service-a logs --function=index
```

All Serverless Framework commands are supported **only via service-specific commands**, including custom commands from plugins, for example:

```bash
serverless service-a offline
```

### Service-specific commands when using parameters

The `serverless service-a deploy` command is the equivalent of running `serverless deploy` in service-a's directory. Both can be used.

However, if "service-a" uses `${param:xxx}` to reference parameters injected by `serverless-compose.yml`, then `serverless service-a deploy` must be used. Indeed, `${param:xxx}` cannot be resolved outside of Serverless Framework Compose.

In these cases, you must run all commands from the root: `serverless service-a deploy`.

## Configuration

All Variable Resolvers are supported in `serverless-compose.yml`. For example, you can use SSM Parameters, Secrets Manager, or custom variables.

For more information, see the [Variable Resolvers documentation](variables).

### Differences with `serverless.yml`

The `serverless-compose.yml` and `serverless.yml` files have different syntaxes and features.

Unless documented here, expect `serverless.yml` features to not be supported in `serverless-compose.yml`.
For example, it is not possible to include plugins inside `serverless-compose.yml`.

You can [open feature requests](https://github.com/serverless/serverless) if you need features that aren't supported in `serverless-compose.yml`.

## Refreshing outputs

To load the latest service state into the state store, run:

```
serverless info
```

This command ensures
that the state store is up to date with the most recent outputs and configurations from your services,
allowing dependent services to access the latest data.
It has no impact on deployed services, it can be run at any time without unintended side effects.

## Removing services

To delete the whole project (and all its services), run `serverless remove` in the same directory as `serverless-compose.yml`. This will run [`serverless remove`](../providers/aws/cli-reference/remove.md) in each service directory.

To delete only one service:

1. make sure no other service depends on it (else these services will be broken)
2. run `serverless <service-name> remove`
3. then remove the service from `serverless-compose.yml`

If you remove the service from `serverless-compose.yml` without doing step 1 first, the service will still be deployed in your AWS account.

Remember to do this for every stage you may have previously deployed.

## FAQ

### Multi-region deployments

> Is multi-region deployment possible via Compose?

It is possible to deploy different services to different regions. For example, deploy service `frontend` to us-east-1 and service `backend` to eu-west-3.

However, Compose currently does not support deploying _the same service_ to multiple regions. The reason is that each service is packaged in the `.serverless/` directory. If the same service was to be deployed in parallel to different regions, package artifacts would conflict and overwrite each others.
