<!--
title: Serverless Framework - Spotinst Guide - Quick Start
menuText: Quick Start
menuOrder: 2
description: Getting started with the Serverless Framework on AWS Lambda
layout: Doc
-->

# Quick Start

Here is a quick guide on how to create a new serverless project using the Spotinst NodeJS template. For more detailed instruction please check out the other reference material provided. 

## Pre-requisites

1. Node.js `v6.5.0` or later.
2. Serverless CLI. You can run `npm install -g serverless` to install it.
3. An Spotinst account. If you don't already have one, you can sign up for a [free trial](https://console.spotinst.com/#/auth/signUp).
4. **Set-up your [Provider Credentials](./credentials.md)**.

## Create a new service

Create a new service using the Node.js template, specifying a unique name and an optional path for your service.

```bash
# Create a new Serverless Service/Project
$ serverless create --template spotinst-nodejs -p new-service
# Change into the newly created directory
$ cd new-service
```

## Install Spotinst Serverless Functions Plugin
  
  You will first need to install the Spotinst Functions plugin before you are able to deploy your function. Once this has been done you do not need to do it again for this project. 

  ```bash
  npm install
  ```

## Deploying and Updating the Function
  
1. **Deploying the Service**

  Use this when you have made changes to your Functions, Events or Resources in `serverless.yml` or you simply want to deploy all changes within your Service at the same time.

  ```bash
  serverless deploy 
  ```

2. **Deploy the Function**

  Use this to quickly upload and overwrite your function code, allowing you to develop faster.

  ```bash
  serverless deploy function -f hello
  ```

3. **Updating the Function**

  Use this to update your function after you have made updates that you want to push to production.
  
  ```bash
  serverless deploy 
  ```


## Invoke the Function

  Invokes a Function

  ```bash
  serverless invoke -f hello
  ```


## Cleanup

If at any point, you no longer need your service, you can run the following command to remove the Functions, Events and Resources that were created, and ensure that you don't incur any unexpected charges.

```bash
serverless remove
```
