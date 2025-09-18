# acorn-sontag

An Acorn-based parser for [Sontag](https://github.com/sontag-js/sontag/) expressions.

## Installation

```bash
npm install acorn-sontag
```

## Usage

```js
import { parseExpression } from 'acorn-sontag';

let result = expression('posts[posts.length - 1] | escape', {
	// The scope to add to filters
	filterScope: 'this.__filters__',

	// The scope to add to other identifiers
	identifierScope: 'this',

	// The name of the range function to call 
	// for the `..` range operator
	rangeFunction: 'this.__filters__.range',
});

console.log(result);
// => this.__filters__.escape(this.posts[this.posts.length - 1])
```