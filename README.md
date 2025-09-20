# acorn-sontag

> __Deprecated:__ This library has been merged into [`sontag-js/sontag`](https://github.com/sontag-js/sontag/) and will no longer be developed separately. The `acorn-sontag` npm package has also been deprecated.

An Acorn-based parser for [Sontag](https://github.com/sontag-js/sontag/) expressions.

## Usage

```js
import { parseExpression } from 'acorn-sontag';

let result = expression('posts[posts.length - 1] | escape', {
	// The scope to add to filters
	filterScope: 'this[Symbol.for("sontag/filters")]',

	// The scope to add to other identifiers
	identifierScope: 'this',

	// The name of the range function to call 
	// for the `..` range operator
	rangeFunction: 'this[Symbol.for("sontag/filters")].range',
});

console.log(result);
// => this[Symbol.for("sontag/filters")].escape(this.posts[this.posts.length - 1])
```