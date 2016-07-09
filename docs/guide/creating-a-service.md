# Creating a service

Let's create our first Serverless service!

## Creating our service

`cd` into a directory of your choice and run `serverless create --name unique-service-name --provider aws` to create a service
skeleton with the service name `unique-service-name` on your local machine. A unique service name is required to use S3 without conflicting
with other buckets in the same region with the same name.

Services are provider specific. The `--provider aws` option tells Serverless to create an Amazon Web Services (AWS)
dependent service.

Type `cd my-service` to navigate into the previously created directory.

## Open the service inside your editor

Let's take a closer look at the skeleton Serverless has created for us. Open up the `first-service` directory with your
favorite editor.

You'll see the following files:
- `serverless.yaml`
- `serverless.env.yaml`
- `handler.js`

### [`serverless.yaml`](../understanding-serverless/serverless-yaml.md)

This is our core service file. You can see the name of our service, the provider and the first function inside the
`functions` definition which points to the `handler.js` file.

If you want to learn more about the [`serverless.yaml`](../understanding-serverless/serverless-yaml.md) file you might
want check out our [in depth guide](../understanding-serverless/serverless-yaml.md) about it.

### [`serverless.env.yaml`](../understanding-serverless/serverless-env-yaml.md)

This file includes all the environment variables Serverless uses. It automatically creates environment variables for a
default stage called `dev` and a default region called `us-east-1`. Those variables will be referenced and used as a
default later on for deployment.

If you want to learn more about the [`serverless.env.yaml`](../understanding-serverless/serverless-env-yaml.md) file you
might want check out our [in depth guide](../understanding-serverless/serverless-env-yaml.md) about it.

### `handler.js`

The `handler.js` file includes a function skeleton which returns a simple message. The function definition in
`serverless.yaml` will point to this `handler.js` file and the function inside of it.

## Conclusion

We've just created our very first service with one simple `create` command. With that in place we're ready to deploy
our service (which now includes one example function) to our provider (in this case Amazon Web Services).

[Next step > Deploying our service](deploying-a-service.md)
