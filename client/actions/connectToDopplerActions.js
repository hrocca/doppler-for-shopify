import * as types from './actionTypes';
import { push } from 'react-router-redux';
import appService from '../services/appService';
import { showErrorBanner } from './errorBannerActions';

export function connectingToDoppler(status = true) {
  return {
    type: types.CONNECTING_TO_DOPPLER,
    connectingToDoppler: status,
  };
}
export function changeDopplerCredentialValiationStatus(valid = true) {
  return {
    type: types.CHANGE_DOPPLER_CREDENTIALS_STATUS,
    invalidDopplerCredentials: !valid,
  };
}

export function userLoggedIn(dopplerAccountName) {
  return {
    type: types.USER_LOGGED_IN,
    dopplerAccountName
  };
}

export function connectToDoppler({ dopplerAccountName, dopplerApiKey }) {
  return (dispatch, getState) => {
    dispatch(connectingToDoppler(true));
    return appService
      .connectToDoppler({ dopplerAccountName, dopplerApiKey })
      .then(success => {
        dispatch(connectingToDoppler(false));
        if (success) {
          dispatch(userLoggedIn(dopplerAccountName))
          dispatch(push('/app/setup-doppler-list'));
        }
        else dispatch(changeDopplerCredentialValiationStatus(false));
      })
      .catch(errorPromise => {
        dispatch(connectingToDoppler(false));
        errorPromise
          .then(msg => dispatch(showErrorBanner(true, msg)))
          .catch(err => dispatch(showErrorBanner()));
      });
  };
}
