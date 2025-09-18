import { Parser, tokTypes, TokenType } from 'acorn';
import { ancestor } from 'acorn-walk';
import { replace } from 'estraverse';
import { generate } from 'astring';

const REPLACEMENT_CHAR = '\uFFFD';
const SENTINEL_CODE = 0xfffe;
const SENTINEL_CHAR = '\uFFFE';

function binop(prec) {
	return {
		beforeExpr: true,
		binop: prec
	};
}

const SONTAG_SYNTAX = [
	{
		match: /(?<!\|)(\|)(?!\|)/g,
		original: '|',
		token: binop(0.2),
		replacement: (node, opts) => {
			let { left, right } = node;

			if (right.type === 'CallExpression') {
				// We have a function on the right-hand side,
				// add left-hand side to the list of arguments
				right.callee.__is_filter__ = true;
				let replacement = {
					...right,
					arguments: right.arguments.concat(left)
				};
				return opts.async ? wrapAwait(replacement) : replacement;
			} else if (right.type === 'Identifier') {
				// We have an identifier on the right-hand side,
				// make it a function that calls the left-hand side
				right.__is_filter__ = true;
				let replacement = {
					type: 'CallExpression',
					callee: right,
					arguments: [ left ]
				};
				return opts.async ? wrapAwait(replacement) : replacement;
			}
		}
	},
	{
		match: /(?<!\.)\.{2}(?!\.)/g,
		original: '..',
		token: binop(8.6),
		replacement: (node, opts) => {
			let { left, right } = node;
			return {
				type: 'CallExpression',
				callee: {
					type: 'Identifier',
					name: opts.rangeFunction
				},
				arguments: [ left, right ]
			};
		}
	},
	{
		match: '//',
		original: '//',
		token: binop(10),
		replacement: (node, opts) => {
			return {
				type: 'CallExpression',
				callee: {
					type: 'Identifier',
					name: opts.truncFunction
				},
				arguments: [{
					...node,
					operator: '/' 
				}]
			};
		}
	},
	{
		match: ' in ',
		original: ' in ',
		token: binop(8.4),
		replacement: (node, opts) => {
			return {
				type: 'CallExpression',
				callee: {
					type: 'MemberExpression',
					object: node.right,
					property: { 
						type: 'Identifier', 
						name: 'includes' 
					},
					computed: false
				},
				arguments: [node.left]
			};
		}
	},

	// Operators
	{ 
		match: ' and ', 
		original: ' and ',
		token: binop(2),
		replacement: (node, opts) => {
			node.operator = '&&';
			return node;
		}
	},
	{ 
		match: ' or ', 
		original: ' or ',
		token: binop(1),
		replacement: (node, opts) => {
			node.operator = '||';
			return node;
		}
	},
	// { 
	// 	match: ' not ', 
	// 	original: ' not ',
	// 	token: {
	// 		beforeExpr: true, 
	// 		prefix: true, 
	// 		startsExpr: true
	// 	}
	// },

	{ 
		match: ' b-or ', 
		original: ' b-or ',
		token: binop(3),
		replacement: (node, opts) => {
			node.operator = '|';
			return node;
		}
	},
	{ 
		match: ' b-and ', 
		original: ' b-and ',
		token: binop(5),
		replacement: (node, opts) => {
			node.operator = '&';
			return node;
		}
	},
	{ 
		match: ' b-xor ', 
		original: ' b-xor ',
		token: binop(4),
		replacement: (node, opts) => {
			node.operator = '^';
			return node;
		}
	},
	{ 
		match: '~', 
		original: '~',
		token: binop(9),
		replacement: (node, opts) => {
			node.operator = '+';
			return node;
		}
	}
].map((it, idx) => {
	// TODO we can’t have more than 36 items in this array.
	return {
		...it,
		marker: idx.toString(36)
	};
});

function putback(str) {
	SONTAG_SYNTAX.forEach(it => {
		str = str.replaceAll(SENTINEL_CHAR + it.marker, it.original);
	});
	return str;
}

class SontagParser extends Parser {
	constructor(...args) {
		super(...args);
		
		/* 
			Allow most reserved keywords as identifiers,
			but keep some of them (literals, etc).
		*/
		this.keywords = /^(?:void|this|null|true|false)$/;

		SONTAG_SYNTAX.forEach(it => {
			if (it.token) {
				const key = 'sontag_' + it.marker;
				tokTypes[key] = new TokenType(key, it.token);
			}
		});
	}

	readToken(code) {
		if (code === SENTINEL_CODE) {
			const next = this.input.charAt(this.pos + 1);
			const it = SONTAG_SYNTAX.find(it => it.marker === next);
			if (it) {
				return this.finishOp(tokTypes['sontag_' + it.marker], 2);
			}
		}
		return super.readToken(code);
	}
}

function wrapAwait(node) {
	return {
		type: "AwaitExpression",
		argument: node
	};
}

export function parseExpression(str, opts) {
	if (!str) return str;

	/*
		We split the string into an Array based on Unicode codepoints,
		rather than iterating on the string itself. 
	 */
	str = Array.from(str.replace(/\f|\r\n?/g, '\n')).map(char => {
		const c = char.codePointAt(0);
		/* 
			Replace null, surrogate code points, and the non-character sentinel 
			used for Sontag with the `U+FFFD REPLACEMENT CHARACTER`.
		*/
		if (!c || (c >= 0xd800 && c <= 0xdfff) || c === SENTINEL_CODE) {
			return REPLACEMENT_CHAR;
		}
		return char;
	}).join('');

	opts = {
		async: false,
		rangeFunction: 'this.__filters__.range',
		identifierScope: 'this',
		truncFunction: 'Math.trunc',
		filterScope: 'this.__filters__',
		...opts
	};

	SONTAG_SYNTAX.forEach(it => {
		str = str.replaceAll(it.match, SENTINEL_CHAR + it.marker);
	});

	let parser = new SontagParser({
		allowReserved: true,
		ecmaVersion: 2020
	}, str);
	parser.nextToken();
	
	let ast = parser.parseExpression();

	const replacements = new Map();

	ancestor(ast, {

		Identifier(node, ancestors) {
			node.__replace_name__ = true;
		},

		TemplateElement(node) {
			// TODO should we treat the two differently?
			node.value.raw = putback(node.value.raw);
			node.value.cooked = putback(node.value.cooked);
		},

		Literal(node) {
			// String literals
			if (typeof node.value === 'string') {
				// TODO should we treat the two differently?
				node.value = putback(node.value);
				node.raw = putback(node.raw);
				return;
			}

			// Regular expression literals
			if (node.regex) {
				node.regex.pattern = putback(node.regex.pattern);
				node.raw = putback(node.raw);
				try {
					node.value = new RegExp(node.regex.pattern, node.regex.flags);
				} catch(err) {
					node.value = null;
				}
				return;
			}
		},

		BinaryExpression(node) {
			const it = SONTAG_SYNTAX.find(it => 
				node.operator === SENTINEL_CHAR + it.marker && it.replacement
			);
			if (it) {
				replacements.set(node, it.replacement(node, opts));
			}
		}
	});

	const result = generate(
		replace(ast, {
			enter(node) {
				if (replacements.has(node)) {
					return replacements.get(node);
				} else if (node.__replace_name__) {
					return {
						...node,
						name: node.__is_filter__ ? 
							`${opts.filterScope}.${node.name}` :
							`${opts.identifierScope}.${node.name}`
					};
				}
			}
		})
	);
	if (result.indexOf(SENTINEL_CHAR) > -1) {
		throw new Error('Unexpected sentinel character, please report an issue');
	}
	return result;
}