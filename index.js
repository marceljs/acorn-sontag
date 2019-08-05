const { Parser, tokTypes, TokenType } = require('acorn');
const { ancestor } = require('acorn-walk');
const { replace } = require('estraverse');
const { generate } = require('astring');
const util = require('util');

const codes = {
	lozenge: '◊'.charCodeAt(0),
	f: 'f'.charCodeAt(0),
	r: 'r'.charCodeAt(0),
	t: 't'.charCodeAt(0),
	s: 's'.charCodeAt(0),
	e: 'e'.charCodeAt(0)
}

const operators = {
	' and ': '&&',
	' or ': '||',
	' b-or ': '|',
	' b-and ': '&',
	' b-xor ': '^',
	'~': '+' 
};

const unsupported_operators = [
	'\\?\\:', // ?:
	'\\?\\?', // ??
	' matches ', 
	' in ', 
	' is ', 
	' not '
];

const operators_re = new RegExp(Object.keys(operators).join('|'), 'g');
const unsupported_re = new RegExp(unsupported_operators.join('|'), 'g');

class SontagParser extends Parser {
	constructor(...args) {
		super(...args);
		
		// Allow reserved keywords as identifiers
		this.keywords = /[^\s\S]/g;

		tokTypes.sontag_filter = new TokenType(`◊f`, {
			beforeExpr: true, 
			binop: 0.99
		});

		tokTypes.sontag_range = new TokenType(`◊r`, {
			beforeExpr: true, 
			binop: 0.98
		});

		tokTypes.sontag_trunc = new TokenType(`◊t`, {
			beforeExpr: true, 
			binop: 0.97
		});

		tokTypes.sontag_startswith = new TokenType(`◊s`, {
			beforeExpr: true, 
			binop: 0.999
		});

		tokTypes.sontag_endswith = new TokenType(`◊e`, {
			beforeExpr: true, 
			binop: 0.999
		});
	}

	readToken(code) {
		if (code === codes.lozenge) {
			let next = this.input.charCodeAt(this.pos + 1);
			if (next === codes.f) {
				return this.finishOp(tokTypes.sontag_filter, 2);
			} else if (next === codes.r) {
				return this.finishOp(tokTypes.sontag_range, 2);
			} else if (next === codes.t) {
				return this.finishOp(tokTypes.sontag_trunc, 2);
			} else if (next === codes.s) {
				return this.finishOp(tokTypes.sontag_startswith, 2);
			} else if (next === codes.e) {
				return this.finishOp(tokTypes.sontag_endswith, 2);
			}
		} else {
			return super.readToken(code);
		}
	}
}

function parseExpression(str, opts) {
	if (!str) return str;

	opts = {
		rangeFunction: 'this.__filters__.range',
		truncFunction: 'Math.floor',
		startsWithFunction: '"".startsWith.call',
		endsWithFunction: '"".endsWith.call',
		identifierScope: 'this',
		filterScope: 'this.__filters__',
		...opts
	};

	// Throw on unsupported operators
	let bummer = str.match(unsupported_re);
	if (bummer) {
		throw new Error(`These operators are not yet supported: ${ bummer.join(', ') }`)
	}

	// Replace | with filter operator and .. with range operator
	str = str
		.replace(/[^\|](\|)(?!\|)/g, function(str, match) {
			return str[0] + '◊f';
		})
		.replace(/[^.]\.{2}(?!\.)/g, function(str, match) {
			return str[0] + '◊r';
		})
		.replace(/\/{2}/g, function(str, match) {
			return '◊t';
		})
		.replace(/ starts with /g, function(str, match) {
			return '◊s';
		})
		.replace(/ ends with /g, function(str, match) {
			return '◊e';
		});

	// Replace Sontag operators with equivalent ECMAScript operators
	str = str.replace(operators_re, matched => operators[matched]);

	let parser = new SontagParser({
		allowReserved: true
	}, str);
	parser.nextToken();
	
	let ast = parser.parseExpression();

	const replacements = new Map();

	ancestor(ast, {

		Identifier(node, ancestors) {
			node.__replace_name__ = true;
		},

		BinaryExpression(node) {
			if (node.operator === '◊f') {
				let { left, right } = node;

				if (right.type === 'CallExpression') {
					// We have a function on the right-hand side,
					// add left-hand side to the list of arguments
					right.callee.__is_filter__ = true;
					replacements.set(node, {
						...right,
						arguments: right.arguments.concat(left)
					});
				} else if (right.type === 'Identifier') {
					// We have an identifier on the right-hand side,
					// make it a function that calls the left-hand side
					right.__is_filter__ = true;
					replacements.set(node, {
						type: 'CallExpression',
						callee: right,
						arguments: [ left ]
					});
				}
			} else if (node.operator === '◊r') {
				let { left, right } = node;
				replacements.set(node, {
					type: 'CallExpression',
					callee: {
						type: 'Identifier',
						name: opts.rangeFunction
					},
					arguments: [ left, right ]
				});
			} else if (node.operator === '◊t') {
				replacements.set(node, {
					type: 'CallExpression',
					callee: {
						type: 'Identifier',
						name: opts.truncFunction
					},
					arguments: [{
						...node,
						operator: '/' 
					}]
				});
			} else if (node.operator === '◊s') {
				replacements.set(node, {
					type: 'CallExpression',
					callee: {
						type: 'Identifier',
						name: opts.startsWithFunction
					},
					arguments: [node.left, node.right]
				});
			} else if (node.operator === '◊e') {
				replacements.set(node, {
					type: 'CallExpression',
					callee: {
						type: 'Identifier',
						name: opts.endsWithFunction
					},
					arguments: [node.left, node.right ]
				});
			}
		}
	});

	return generate(
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
}

module.exports = {
	expression: parseExpression
};