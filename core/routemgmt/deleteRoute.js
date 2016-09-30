/**
 *
 * Copyright 2015-2016 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Delete an API Gateway to action mapping document from the database:
 * https://docs.cloudant.com/document.html#delete
 *
 * Parameters (all as fields in the message JSON object)
 *   host       Required. The database dns host name
 *   port       Required. The database port number
 *   protocol   Required. The database protocol (i.e. http, https)
 *   dbname     Required. The name of the database
 *   username   Required. The database user name used to access the database
 *   password   Required. The database user password
 *   docid      Required. The database id of the API Gateway mapping document
 *                        Format:  owNamespace:MethodVerb:gatewayPath
 *                        Example: mdeuser@us.ibm.com_dev:get:/v1/order
 *
 * NOTE: The package containing this action will be bound to the following values:
 *         host, port, protocol, dbname, username, password
 *       As such, the caller to this action should normally avoid explicitly setting
 *       these values
 **/

function main(message) {

  if(!message) {
    console.error('No message argument!');
    return whisk.error('Internal error.  A message parameter was not supplied.');
  }

  // The host, port, protocol, username, and password parameters are validated here
  var cloudantOrError = getCloudantAccount(message);
  if (typeof cloudantOrError !== 'object') {
    console.error('CloudantAccount returned an unexpected object type: '+(typeof cloudantOrError));
    return whisk.error('Internal error.  An unexpected object type was obtained.');
  }
  var cloudant = cloudantOrError;

  var docRev = message.docrev;

  // Validate the remaining parameters (dbname and docid)
  if(!message.dbname) {
    return whisk.error('dbname is required.');
  }
  if(!message.docid) {
    return whisk.error('docid is required.');
  }

  // Log parameter values
  console.log('DB host    : '+message.host);
  console.log('DB port    : '+message.port);
  console.log('DB protocol: '+message.protocol);
  console.log('DB username: '+message.username);
  console.log('DB database: '+message.dbname);
  console.log('doc id     : '+message.docid);

  var cloudantDb = cloudant.use(message.dbname);

  return new Promise(function (resolve, reject) {
    getCurrentDocRev(cloudantDb, message.docid)
    .then(function(docRev) {
      console.log('Document revision to delete: '+docRev);
      destroy(cloudantDb, message.docid, docRev)
      .then(function (result) {
        console.log('Document deleted: '+message.docid+' '+docRev);
        resolve(result);
      })
      .catch(function (err) {
        console.error('Document delete failed: '+message.docid+' '+docRev+': '+JSON.stringify(err));
        resolve(result);
      });
    })
    .catch(function(err) {
      var errStr = JSON.stringify(err);
      console.error('Could not obtain document revision; unable to delete document: '+errStr);
      reject(errStr);  // FIXME MWD issue with rejecting object; so using string
    });
  });

}

/**
 * Delete document by id and rev.
 */
function destroy(cloudantDb, docId, docRev) {
  return new Promise( function(resolve, reject) {
    cloudantDb.destroy(docId, docRev, function(error, response) {
      if (!error) {
        console.log('success', response);
        resolve(response);
      } else {
        console.error('error', JSON.stringify(error));
        reject(error);
      }
    });
  });
}

function getCloudantAccount(message) {
  // full cloudant URL - Cloudant NPM package has issues creating valid URLs
  // when the username contains dashes (common in Bluemix scenarios)
  var cloudantUrl;

  if (message.url) {
    // use bluemix binding
    cloudantUrl = message.url;
  } else {
    if (!message.host) {
      whisk.error('cloudant account host is required.');
      return;
    }
    if (!message.username) {
      whisk.error('cloudant account username is required.');
      return;
    }
    if (!message.password) {
      whisk.error('cloudant account password is required.');
      return;
    }
    if (!message.port) {
      whisk.error('cloudant account port is required.');
      return;
    }
    if (!message.protocol) {
      whisk.error('cloudant account protocol is required.');
      return;
    }

    cloudantUrl = message.protocol + "://" + message.username + ":" + message.password + "@" + message.host + ":" + message.port;
  }

  return require('cloudant')({
    url: cloudantUrl
  });
}

function getCurrentDocRev(db, docid) {
  var actionName = '/whisk.system/routemgmt/getRoute';
  var params = { 'docid': docid };
  console.log('getCurrentDocRev() for docid: '+docid);
  return new Promise( function (resolve, reject) {
    whisk.invoke({
      name: actionName,
      blocking: true,
      parameters: params
    })
    .then(function (activation) {
      console.log('whisk.invoke('+actionName+', '+docid+') ok');
      console.log('Results: '+JSON.stringify(activation));
      if (activation && activation.result && activation.result._rev) {
        resolve(activation.result._rev);
      } else {
        console.error('_rev value not returned!');
        reject('Route '+docid+' was not located');
      }
    })
    .catch(function (error) {
      console.error('whisk.invoke('+actionName+', '+docid+') error:\n'+JSON.stringify(error));
      reject(error);
    });
  });
}
