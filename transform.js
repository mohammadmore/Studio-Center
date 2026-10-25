module.exports = function(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  const vars = [
    'roles', 'colleagues', 'organizations', 'collections', 'contents',
    'settings', 'leaves', 'audit_logs', 'recycle_bin', 'batch_operations',
    'notifications', 'tokens', 'templatesData', 'contentTemplates',
    'templateSuggestions', 'expenses', 'invoices', 'mediaAssets',
    'smartEventsBank', 'clientSelections', 'saveTimeout', 'localDbTimestamp', 'cachedCategories'
  ];

  root.find(j.VariableDeclaration)
    .filter(path => path.parent.node.type === 'Program')
    .forEach(path => {
      path.node.declarations = path.node.declarations.filter(decl => {
        return decl.id.type !== 'Identifier' || !vars.includes(decl.id.name);
      });
      if (path.node.declarations.length === 0) {
        j(path).remove();
      }
    });

  vars.forEach(v => {
    // We do shorthand replacement separately to avoid node conflict
    root.find(j.Property, { shorthand: true, key: { type: 'Identifier', name: v } })
      .forEach(path => {
        // Just create a new non-shorthand property!
        j(path).replaceWith(
          j.property(
            'init',
            j.identifier(v),
            j.memberExpression(
              j.identifier('dbState'),
              j.identifier(v)
            )
          )
        );
      });

    // Now regular identifiers
    root.find(j.Identifier, { name: v })
      .filter(path => {
        // Exclude MemberExpression properties
        if (path.parent.node.type === 'MemberExpression' && path.parent.node.property === path.node && !path.parent.node.computed) {
          return false;
        }
        // Exclude Property keys
        if (path.parent.node.type === 'Property' && path.parent.node.key === path.node && !path.parent.node.computed) {
          return false;
        }
        // Exclude type annotations
        if (path.parent.node.type === 'TSPropertySignature') return false;
        // Exclude function params/declarations
        if (['FunctionDeclaration', 'ArrowFunctionExpression', 'FunctionExpression'].includes(path.parent.node.type) && path.parent.node.params.includes(path.node)) {
          return false;
        }
        
        let scope = path.scope.lookup(v);
        if (scope && scope.node.type !== 'Program') {
          return false; 
        }
        
        return true;
      })
      .replaceWith(j.memberExpression(
        j.identifier('dbState'),
        j.identifier(v)
      ));
  });

  return root.toSource();
};
