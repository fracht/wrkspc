# wrkspc

[![npm version](https://img.shields.io/npm/v/wrkspc)](https://www.npmjs.com/package/wrkspc)
[![npm downloads](https://img.shields.io/npm/dw/wrkspc)](https://www.npmjs.com/package/wrkspc)
[![vulnerabilities](https://img.shields.io/snyk/vulnerabilities/npm/wrkspc)](https://www.npmjs.com/package/wrkspc)

> Tiny tool to save & restore npm / yarn workspace

## The problem

Running a NodeJS package with workspaces in docker container could be painful. To properly install dependencies, whole project structure needs to be copied. However, to avoid breaking docker caching algorithm, each `package.json` file should be copied individually. As a result, the `Dockerfile` grows dramatically and becomes unmaintainable. To visualize this, consider the following project structure:

```
|-apps
| |-main
| |-auth
|-libs
| |-components
| |-utils
|-tools
  |-some-tool
```

Your `Dockerfile` for installing dependencies will look like this:

```Dockerfile
FROM node:18

COPY package.json ./
COPY package-lock.json ./
COPY ./apps/main/package.json ./apps/main/
COPY ./apps/auth/package.json ./apps/auth/
COPY ./libs/components/package.json ./libs/components/
COPY ./libs/utils/package.json ./libs/utils/
COPY ./tools/some-tool/package.json ./tools/some-tool/

RUN npm ci
```

And situation gets even worse, when you introduce packages with binaries in your workspace - all binaries need to be copied & compiled before installing dependencies, to help npm link all binaries.

With this tool, you no longer need to think about all those horrible configurations. With `wrkspc`, that's how your dockerfiles will look like:

```Dockerfile
FROM node:18

COPY workspace-lock.json ./
COPY package-lock.json ./

RUN npx -y wrkspc unpack

RUN npm ci
```

## Usage

It's recommended to run `wrkspc` packing command after each `package.json` change, to keep workspace lockfile up-to-date. To simplify this task, you can put workspace lockfile generation command into `postinstall` script:

```json
{
    "scripts": {
        "postinstall": "wrkspc"
    }
}
```

This will generate `workspace-lock.json` file after each `npm install` command run. This file should be included into your VCS (git, svn, etc.)
To restore your npm / yarn workspace, run `unpack` command, in the directory, which contains `workspace-lock.json` file:

```sh
npx wrkspc unpack
```

This will re-create whole package structure.

## Commands

-   pack - Generate a lockfile of your npm / yarn workspace.
-   unpack - Restore npm / yarn workspace from lockfile.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

MIT © [Artiom Tretjakovas](https://github.com/ArtiomTr)
