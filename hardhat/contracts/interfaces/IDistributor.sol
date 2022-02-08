// SPDX-License-Identifier: GNU-GPL v3.0 or later

pragma solidity >=0.8.0;

import "./IRegistryProvider.sol";
import '@openzeppelin/contracts/utils/introspection/IERC165.sol';

/**
 * @title Provider interface for Revest FNFTs
 */
interface IDistributor {

    function claim() external returns (uint amountTransferred);

    function N_COINS() external view returns (uint n);

    function tokens(uint index) external view returns (address token);

    function user_epoch_of(address _addr) external view returns (uint epoch);

}
